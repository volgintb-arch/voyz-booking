// Booking lifecycle on the server. Pricing and availability reuse the app's
// domain code (../../src/domain) so guest, host and server always agree.

import { conflictsFor, freeUnits } from '../../../src/domain/availability';
import { nightsBetween, todayIn } from '../../../src/domain/dates';
import { bookingMoney } from '../../../src/domain/ledger';
import { percentOf } from '../../../src/domain/money';
import { quoteStay, refundOnCancel, validateStay } from '../../../src/domain/pricing';
import { NEXT_STATUSES } from '../../../src/domain/status';
import type { Booking, BookingStatus, CancelReason, Channel, Lang, LinkSource, Payment, PaymentKind, PaymentMethod } from '../../../src/domain/types';
import type { Ctx } from '../context';
import { encrypt, randomToken, sha256 } from '../crypto';
import { many, one, tx, type Queryable, type Tx } from '../db';
import { ApiError, notFound } from '../http';
import { loadBundle, toBooking, toPayment, type BlockRow, type BookingRow, type PaymentRow, type PropertyRow } from '../model';
import { enqueueBooking, enqueuePayment } from './outbox';

const EXCLUSION_VIOLATION = '23P01';

async function nextBookingId(q: Queryable, checkIn: string): Promise<string> {
  const r = await one<{ n: number }>(q, `select nextval('booking_seq')::int as n`);
  return `VZ-${checkIn.slice(0, 4)}-${String(r!.n).padStart(4, '0')}`;
}

async function insertBooking(c: Tx, b: Booking, guestTokenHash: string | null): Promise<Booking> {
  try {
    const row = await one<BookingRow>(
      c,
      `insert into bookings (id, version, property_id, unit_id, category_id, check_in, check_out, guests, guest_name, guest_phone,
         channel, status, currency, total, prepayment_due, non_refundable_prepayment, note, created_at, updated_at, created_by,
         source, hold_until, guest_token_hash, channel_commission)
       values ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18,$19,$20,$21,$22)
       returning *`,
      [
        b.id, b.propertyId, b.unitId, b.categoryId, b.checkIn, b.checkOut, b.guests, b.guestName, b.guestPhone,
        b.channel, b.status, b.currency, b.total, b.prepaymentDue, b.nonRefundablePrepayment, b.note, b.createdAt, b.createdBy,
        b.source, b.holdUntil, guestTokenHash, b.channelCommission ?? 0,
      ],
    );
    return toBooking(row!);
  } catch (e) {
    if ((e as { code?: string }).code === EXCLUSION_VIOLATION) throw new ApiError('dates_taken', 'These dates are already taken');
    throw e;
  }
}

/** Serialises bookings of one property so availability checks and inserts do not race. */
async function lockProperty(c: Tx, propertyId: string): Promise<void> {
  await c.query('select id from properties where id = $1 for update', [propertyId]);
}

export interface GuestBookingInput {
  categoryId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestPhone: string;
  source: LinkSource;
}

function channelFor(source: LinkSource): Channel {
  return source === 'instagram' || source === 'whatsapp' || source === 'telegram' ? source : 'voyz';
}

export async function createGuestBooking(ctx: Ctx, slug: string, input: GuestBookingInput): Promise<{ booking: Booking; guestToken: string }> {
  const result = await tx(ctx.db, async (c) => {
    const head = await one<PropertyRow>(c, 'select * from properties where slug = $1 and published', [slug]);
    if (!head) notFound('Property not found');
    await lockProperty(c, head.id);
    const bundle = (await loadBundle(c, { id: head.id }, input.checkIn))!;
    const category = bundle.categories.find((x) => x.id === input.categoryId) ?? notFound('Category not found');
    const policy = bundle.property.cancellation;
    const quote = quoteStay(category, bundle.seasons, input.checkIn, input.checkOut, input.guests, policy);
    const problem = validateStay(category, quote, input.checkIn, input.checkOut, input.guests);
    if (problem) throw new ApiError('bad_request', `Stay is not allowed: ${problem}`, { problem, minNights: quote.minNights });
    if (input.checkIn < todayIn(bundle.property.timezone, ctx.now())) throw new ApiError('bad_request', 'Check-in is in the past');
    const unit = freeUnits(bundle.units, category.id, input.checkIn, input.checkOut, bundle.bookings, bundle.blocks)[0];
    if (!unit) throw new ApiError('dates_taken', 'No free units for these dates');

    const now = ctx.now();
    const guestToken = randomToken(24);
    const needsHold = quote.prepaymentDue > 0;
    const booking = await insertBooking(
      c,
      {
        id: await nextBookingId(c, input.checkIn),
        version: 1,
        propertyId: bundle.property.id,
        unitId: unit.id,
        categoryId: category.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        channel: channelFor(input.source),
        status: 'pending',
        currency: bundle.property.currency,
        total: quote.total,
        prepaymentDue: quote.prepaymentDue,
        nonRefundablePrepayment: policy.nonRefundable,
        note: '',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        cancelledAt: null,
        cancelReason: null,
        createdBy: 'guest',
        source: input.source,
        holdUntil: needsHold ? new Date(now.getTime() + bundle.row.hold_hours * 3_600_000).toISOString() : null,
        guestReportedPaidAt: null,
      },
      sha256(guestToken),
    );
    await enqueueBooking(c, booking);
    return { booking, guestToken, ownerId: bundle.row.owner_id };
  });
  await ctx.notify.bookingCreated(result.ownerId, result.booking);
  return { booking: result.booking, guestToken: result.guestToken };
}

export interface HostBookingInput {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestPhone: string;
  channel: Channel;
  total?: number;
  confirm: boolean;
  note: string;
}

export async function createHostBooking(ctx: Ctx, hostId: string, propertyId: string, input: HostBookingInput): Promise<Booking> {
  return tx(ctx.db, async (c) => {
    await assertOwner(c, hostId, propertyId);
    await lockProperty(c, propertyId);
    const bundle = (await loadBundle(c, { id: propertyId }, input.checkIn))!;
    const unit = bundle.units.find((u) => u.id === input.unitId) ?? notFound('Unit not found');
    const category = bundle.categories.find((x) => x.id === unit.categoryId)!;
    if (nightsBetween(input.checkIn, input.checkOut) < 1) throw new ApiError('bad_request', 'Check-out must be after check-in');
    const conflicts = conflictsFor(unit.id, input.checkIn, input.checkOut, bundle.bookings, bundle.blocks);
    if (conflicts.length > 0) throw new ApiError('dates_taken', 'Unit is taken on these dates', { conflicts });
    const quote = quoteStay(category, bundle.seasons, input.checkIn, input.checkOut, input.guests, bundle.property.cancellation);
    const total = input.total ?? quote.total;
    const now = ctx.now().toISOString();
    const booking = await insertBooking(
      c,
      {
        id: await nextBookingId(c, input.checkIn),
        version: 1,
        propertyId,
        unitId: unit.id,
        categoryId: category.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        channel: input.channel,
        status: input.confirm ? 'confirmed' : 'pending',
        currency: bundle.property.currency,
        total,
        prepaymentDue: percentOf(total, bundle.property.cancellation.prepaymentPercent),
        nonRefundablePrepayment: bundle.property.cancellation.nonRefundable,
        note: input.note,
        createdAt: now,
        updatedAt: now,
        cancelledAt: null,
        cancelReason: null,
        createdBy: 'host',
        source: null,
        holdUntil: null,
        guestReportedPaidAt: null,
      },
      null,
    );
    await enqueueBooking(c, booking);
    return booking;
  });
}

export interface OtaBookingInput {
  guestName: string;
  guestPhone: string;
  guests: number;
  channel: Channel;
  total: number;
  commission: number;
  note: string;
}

/**
 * "Оформить бронь" on a Booking.com / Airbnb stripe: iCal gave only the dates, the
 * host adds the guest, the sum and the commission from the OTA extranet. The block
 * becomes a confirmed booking (and goes to Aynes); the event UID keeps the next
 * sync from blocking the same dates again.
 */
export async function bookFromIcalBlock(ctx: Ctx, hostId: string, blockId: string, input: OtaBookingInput): Promise<Booking> {
  return tx(ctx.db, async (c) => {
    const bl = await one<BlockRow & { property_id: string; ical_channel_id: string | null; ical_uid: string | null }>(
      c,
      'select b.*, u.property_id from blocks b join units u on u.id = b.unit_id where b.id = $1',
      [blockId],
    );
    if (!bl || bl.reason !== 'ical') notFound('Block not found');
    await assertOwner(c, hostId, bl.property_id);
    await lockProperty(c, bl.property_id);
    if (input.commission > input.total) throw new ApiError('bad_request', 'Commission is larger than the total');
    await c.query('delete from blocks where id = $1', [blockId]);
    const bundle = (await loadBundle(c, { id: bl.property_id }, bl.date_from))!;
    const unit = bundle.units.find((u) => u.id === bl.unit_id)!;
    const conflicts = conflictsFor(unit.id, bl.date_from, bl.date_to, bundle.bookings, bundle.blocks);
    if (conflicts.length > 0) throw new ApiError('dates_taken', 'Unit is taken on these dates', { conflicts });
    const now = ctx.now().toISOString();
    const booking = await insertBooking(
      c,
      {
        id: await nextBookingId(c, bl.date_from),
        version: 1,
        propertyId: bl.property_id,
        unitId: unit.id,
        categoryId: unit.categoryId,
        checkIn: bl.date_from,
        checkOut: bl.date_to,
        guests: input.guests,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        channel: input.channel,
        // The OTA already confirmed it and handles the guest's prepayment.
        status: 'confirmed',
        currency: bundle.property.currency,
        total: input.total,
        prepaymentDue: 0,
        nonRefundablePrepayment: false,
        note: input.note,
        createdAt: now,
        updatedAt: now,
        cancelledAt: null,
        cancelReason: null,
        createdBy: 'host',
        source: null,
        holdUntil: null,
        guestReportedPaidAt: null,
        channelCommission: input.commission,
      },
      null,
    );
    await c.query('update bookings set ical_channel_id = $2, ical_uid = $3 where id = $1', [booking.id, bl.ical_channel_id, bl.ical_uid]);
    await enqueueBooking(c, booking);
    return booking;
  });
}

export async function assertOwner(q: Queryable, hostId: string, propertyId: string): Promise<PropertyRow> {
  const p = await one<PropertyRow>(q, 'select * from properties where id = $1', [propertyId]);
  if (!p || p.owner_id !== hostId) notFound('Property not found');
  return p;
}

/** Loads a booking the host owns, locked for update. */
async function ownedBooking(c: Tx, hostId: string, bookingId: string): Promise<{ booking: Booking; property: PropertyRow }> {
  const row = await one<BookingRow & { owner_id: string }>(
    c,
    `select b.*, p.owner_id from bookings b join properties p on p.id = b.property_id where b.id = $1 for update of b`,
    [bookingId],
  );
  if (!row || row.owner_id !== hostId) notFound('Booking not found');
  const property = (await one<PropertyRow>(c, 'select * from properties where id = $1', [row.property_id]))!;
  return { booking: toBooking(row), property };
}

async function paymentsOf(q: Queryable, bookingId: string): Promise<Payment[]> {
  return (await many<PaymentRow>(q, 'select * from payments where booking_id = $1 order by paid_at', [bookingId])).map(toPayment);
}

async function writeStatus(c: Tx, booking: Booking, status: BookingStatus, now: string, reason: CancelReason | null): Promise<Booking> {
  const row = await one<BookingRow>(
    c,
    `update bookings set status = $2, version = version + 1, updated_at = $3,
       cancelled_at = case when $2 = 'cancelled' and cancelled_at is null then $3::timestamptz else cancelled_at end,
       cancel_reason = case when $2 = 'cancelled' then $4 else cancel_reason end,
       hold_until = case when $2 = 'pending' then hold_until else null end
     where id = $1 returning *`,
    [booking.id, status, now, reason],
  );
  const updated = toBooking(row!);
  await enqueueBooking(c, updated);
  return updated;
}

export async function setStatus(ctx: Ctx, hostId: string, bookingId: string, status: BookingStatus): Promise<Booking> {
  const updated = await tx(ctx.db, async (c) => {
    const { booking } = await ownedBooking(c, hostId, bookingId);
    if (!NEXT_STATUSES[booking.status].includes(status)) {
      throw new ApiError('conflict', `Cannot change ${booking.status} to ${status}`, { allowed: NEXT_STATUSES[booking.status] });
    }
    return writeStatus(c, booking, status, ctx.now().toISOString(), status === 'cancelled' ? 'host' : null);
  });
  if (status === 'confirmed') await ctx.notify.guestUpdate(bookingId, 'confirmed');
  if (status === 'cancelled') await ctx.notify.guestUpdate(bookingId, 'declined');
  return updated;
}

async function insertPayment(c: Tx, p: Omit<Payment, 'id'>, propertyId: string): Promise<Payment> {
  const n = await one<{ n: number }>(c, `select nextval('payment_seq')::int as n`);
  const row = await one<PaymentRow>(
    c,
    `insert into payments (id, booking_id, kind, method, provider, amount, fee, currency, paid_at, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [`P-${n!.n}`, p.bookingId, p.kind, p.method, p.provider, p.amount, p.fee, p.currency, p.paidAt, p.status],
  );
  const payment = toPayment(row!);
  await enqueuePayment(c, propertyId, payment);
  return payment;
}

export interface PaymentInput {
  kind: PaymentKind;
  method: PaymentMethod;
  amount: number;
  /** Kept by the OTA or the acquirer out of this payment (Airbnb payout, card fee). */
  fee?: number;
  provider: string | null;
}

export async function addHostPayment(ctx: Ctx, hostId: string, bookingId: string, input: PaymentInput): Promise<Payment> {
  if ((input.fee ?? 0) > input.amount) throw new ApiError('bad_request', 'Fee is larger than the payment');
  return tx(ctx.db, async (c) => {
    const { booking } = await ownedBooking(c, hostId, bookingId);
    return insertPayment(
      c,
      {
        bookingId,
        kind: input.kind,
        method: input.method,
        provider: input.provider,
        amount: input.amount,
        fee: input.fee ?? 0,
        currency: booking.currency,
        paidAt: ctx.now().toISOString(),
        status: 'succeeded',
      },
      booking.propertyId,
    );
  });
}

/** "Деньги пришли": record the missing deposit and confirm a pending booking (D-001). */
export async function confirmDeposit(ctx: Ctx, hostId: string, bookingId: string, method: PaymentMethod): Promise<Booking> {
  const { booking, event } = await tx(ctx.db, async (c) => {
    const { booking } = await ownedBooking(c, hostId, bookingId);
    if (booking.status === 'cancelled' || booking.status === 'no_show') throw new ApiError('conflict', 'Booking is cancelled');
    const due = Math.max(0, booking.prepaymentDue - bookingMoney(booking, await paymentsOf(c, bookingId)).paid);
    const now = ctx.now().toISOString();
    if (due > 0) {
      await insertPayment(
        c,
        { bookingId, kind: 'prepayment', method, provider: null, amount: due, fee: 0, currency: booking.currency, paidAt: now, status: 'succeeded' },
        booking.propertyId,
      );
    }
    if (booking.status === 'pending') return { booking: await writeStatus(c, booking, 'confirmed', now, null), event: 'confirmed' as const };
    return { booking, event: due > 0 ? ('deposit' as const) : null };
  });
  if (event) await ctx.notify.guestUpdate(bookingId, event);
  return booking;
}

export async function extendHold(ctx: Ctx, hostId: string, bookingId: string, hours: number): Promise<Booking> {
  const extended = await tx(ctx.db, async (c) => {
    const { booking } = await ownedBooking(c, hostId, bookingId);
    if (booking.status !== 'pending' || !booking.holdUntil) throw new ApiError('conflict', 'Booking is not on hold');
    const base = Math.max(Date.parse(booking.holdUntil), ctx.now().getTime());
    const row = await one<BookingRow>(c, 'update bookings set hold_until = $2 where id = $1 returning *', [
      bookingId,
      new Date(base + hours * 3_600_000).toISOString(),
    ]);
    return toBooking(row!);
  });
  await ctx.notify.guestUpdate(bookingId, 'extended');
  return extended;
}

// ---------- Guest side (authorised by the token given at booking time) ----------

async function guestBooking(q: Queryable, bookingId: string, token: string): Promise<BookingRow> {
  const row = await one<BookingRow>(q, 'select * from bookings where id = $1', [bookingId]);
  // Same answer for a wrong token and a missing booking.
  if (!row || !row.guest_token_hash || row.guest_token_hash !== sha256(token)) notFound('Booking not found');
  return row;
}

export interface GuestView {
  booking: Booking;
  paid: number;
  property: { slug: string; name: PropertyRow['name']; region: PropertyRow['region']; timezone: string; checkInTime: string; checkOutTime: string };
  payment: { qrImage: string | null; recipient: string; details: string };
  categoryName: PropertyRow['name'];
  refundIfCancelled: number;
  /** Follow the booking in the Telegram bot (available: the server has a bot). */
  telegram: { available: boolean; linked: boolean };
}

export async function guestView(ctx: Ctx, bookingId: string, token: string): Promise<GuestView> {
  const row = await guestBooking(ctx.db, bookingId, token);
  const booking = toBooking(row);
  const p = (await one<PropertyRow>(ctx.db, 'select * from properties where id = $1', [row.property_id]))!;
  const cat = await one<{ name: PropertyRow['name'] }>(ctx.db, 'select name from categories where id = $1', [row.category_id]);
  const paid = bookingMoney(booking, await paymentsOf(ctx.db, bookingId)).paid;
  // Guests see their own name and dates; the phone stays with the host.
  return {
    booking: { ...booking, guestPhone: '' },
    paid,
    property: {
      slug: p.slug,
      name: p.name,
      region: p.region,
      timezone: p.timezone,
      checkInTime: p.check_in_time,
      checkOutTime: p.check_out_time,
    },
    payment: { qrImage: p.pay_qr_image, recipient: p.pay_recipient, details: p.pay_details },
    categoryName: cat?.name ?? p.name,
    refundIfCancelled: refundOnCancel(
      { prepaymentPercent: p.prepayment_percent, freeCancelDays: p.free_cancel_days, nonRefundable: p.non_refundable },
      paid,
      booking.checkIn,
      todayIn(p.timezone, ctx.now()),
    ),
    telegram: { available: ctx.config.TELEGRAM_BOT_USERNAME !== '', linked: row.guest_chat_id !== null },
  };
}

export async function guestReportPaid(ctx: Ctx, bookingId: string, token: string): Promise<void> {
  const row = await guestBooking(ctx.db, bookingId, token);
  if (row.status !== 'pending') return;
  const updated = await one<BookingRow>(
    ctx.db,
    'update bookings set guest_reported_paid_at = coalesce(guest_reported_paid_at, $2) where id = $1 returning *',
    [bookingId, ctx.now().toISOString()],
  );
  const owner = await one<{ owner_id: string }>(ctx.db, 'select owner_id from properties where id = $1', [row.property_id]);
  if (owner && updated) await ctx.notify.guestReportedPaid(owner.owner_id, toBooking(updated));
}

export async function guestCancel(ctx: Ctx, bookingId: string, token: string): Promise<Booking> {
  const result = await tx(ctx.db, async (c) => {
    const row = await guestBooking(c, bookingId, token);
    const booking = toBooking(row);
    if (booking.status !== 'pending' && booking.status !== 'confirmed') throw new ApiError('conflict', 'Booking cannot be cancelled');
    const updated = await writeStatus(c, booking, 'cancelled', ctx.now().toISOString(), 'guest');
    const owner = await one<{ owner_id: string }>(c, 'select owner_id from properties where id = $1', [row.property_id]);
    return { updated, ownerId: owner!.owner_id };
  });
  await ctx.notify.guestCancelled(result.ownerId, result.updated);
  return result.updated;
}

/** Releases pending bookings whose deposit did not arrive in time (D-001). */
export async function expireHolds(ctx: Ctx): Promise<Booking[]> {
  const nowIso = ctx.now().toISOString();
  const expired = await tx(ctx.db, async (c) => {
    const rows = await many<BookingRow>(
      c,
      `select * from bookings where status = 'pending' and hold_until is not null and hold_until <= $1 for update skip locked`,
      [nowIso],
    );
    const out: { booking: Booking; ownerId: string }[] = [];
    for (const row of rows) {
      const booking = toBooking(row);
      if (bookingMoney(booking, await paymentsOf(c, booking.id)).paid >= booking.prepaymentDue) continue;
      const updated = await writeStatus(c, booking, 'cancelled', nowIso, 'hold_expired');
      const owner = await one<{ owner_id: string }>(c, 'select owner_id from properties where id = $1', [row.property_id]);
      out.push({ booking: updated, ownerId: owner!.owner_id });
    }
    return out;
  });
  for (const e of expired) {
    await ctx.notify.holdExpired(e.ownerId, e.booking);
    await ctx.notify.guestUpdate(e.booking.id, 'expired');
  }
  return expired.map((e) => e.booking);
}

/** One reminder to a guest who follows the booking in Telegram: less than an hour left to pay. */
export async function remindHolds(ctx: Ctx): Promise<number> {
  const now = ctx.now();
  const rows = await many<BookingRow>(
    ctx.db,
    `select * from bookings where status = 'pending' and guest_chat_id is not null and guest_reported_paid_at is null
        and hold_until > $1 and hold_until <= $2`,
    [now.toISOString(), new Date(now.getTime() + 3_600_000).toISOString()],
  );
  let sent = 0;
  for (const row of rows) {
    const booking = toBooking(row);
    if (bookingMoney(booking, await paymentsOf(ctx.db, booking.id)).paid >= booking.prepaymentDue) continue;
    // A new deadline (the host extended it) earns a new reminder.
    const key = `hold-reminder:${booking.id}:${booking.holdUntil}`;
    const fresh = await ctx.db.query('insert into notification_log(key) values ($1) on conflict do nothing', [key]);
    if (!fresh.rowCount) continue;
    await ctx.notify.guestUpdate(booking.id, 'reminder');
    sent++;
  }
  return sent;
}

/**
 * t.me link that lets the guest follow this booking in the bot. The code stays the
 * same until used, so every screen shows the same link.
 */
export async function guestTelegramLink(ctx: Ctx, bookingId: string, token: string, lang: Lang): Promise<{ url: string; linked: boolean }> {
  const bot = ctx.config.TELEGRAM_BOT_USERNAME;
  if (!bot) throw new ApiError('conflict', 'Telegram bot is not configured');
  const row = await guestBooking(ctx.db, bookingId, token);
  const code = row.guest_link_code ?? randomToken(16);
  await ctx.db.query('update bookings set guest_link_code = $2, guest_lang = $3, guest_token_enc = $4 where id = $1', [
    bookingId,
    code,
    lang,
    encrypt(token, ctx.config.SERVER_SECRET, 'guest-token'),
  ]);
  return { url: `https://t.me/${bot}?start=g_${code}`, linked: row.guest_chat_id !== null };
}

