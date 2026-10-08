// Host workspace: snapshot of everything the host owns, and settings changes.

import { conflictsFor } from '../../../src/domain/availability';
import { nightsBetween } from '../../../src/domain/dates';
import type { Localized, PaymentMethod, PropertyKind } from '../../../src/domain/types';
import type { Ctx } from '../context';
import { encrypt, newId, randomToken } from '../crypto';
import { many, one, tx } from '../db';
import { ApiError, notFound } from '../http';
import {
  loadBundle,
  toBlock,
  toBooking,
  toCategory,
  toIcal,
  toOutbox,
  toPayment,
  toProperty,
  toSeason,
  toUnit,
  type BlockRow,
  type BookingRow,
  type CategoryRow,
  type IcalRow,
  type OutboxRow,
  type PaymentRow,
  type PropertyRow,
  type SeasonRow,
  type UnitRow,
} from '../model';
import { assertOwner } from './bookings';
import { backfill } from './outbox';
import { listPhotos } from './photos';
import type { HostIdentity } from './auth';

export async function snapshot(ctx: Ctx, host: HostIdentity) {
  const props = await many<PropertyRow>(ctx.db, 'select * from properties where owner_id = $1 order by created_at', [host.id]);
  const ids = props.map((p) => p.id);
  const [categories, units, seasons, bookings, payments, blocks, channels, outbox, photos] = await Promise.all([
    many<CategoryRow>(ctx.db, 'select * from categories where property_id = any($1) order by sort, id', [ids]),
    many<UnitRow>(ctx.db, 'select * from units where property_id = any($1) order by sort, name', [ids]),
    many<SeasonRow>(ctx.db, 'select * from seasons where property_id = any($1) order by date_from', [ids]),
    many<BookingRow>(ctx.db, `select * from bookings where property_id = any($1) and check_out > now() - interval '400 days'`, [ids]),
    many<PaymentRow>(
      ctx.db,
      `select pay.* from payments pay join bookings b on b.id = pay.booking_id
        where b.property_id = any($1) and b.check_out > now() - interval '400 days'`,
      [ids],
    ),
    many<BlockRow>(ctx.db, `select b.* from blocks b join units u on u.id = b.unit_id where u.property_id = any($1) and b.date_to > now() - interval '30 days'`, [ids]),
    many<IcalRow>(ctx.db, 'select c.* from ical_channels c join units u on u.id = c.unit_id where u.property_id = any($1)', [ids]),
    many<OutboxRow>(ctx.db, 'select * from outbox where property_id = any($1) order by id desc limit 50', [ids]),
    listPhotos(ctx, ids),
  ]);
  return {
    host: { id: host.id, name: host.name, username: host.username, lang: host.lang },
    properties: props.map((p) => ({
      ...toProperty(p),
      aynes: { connected: p.aynes_key_enc !== null, keyHint: p.aynes_key_hint, shareGuestName: p.aynes_share_guest_name },
    })),
    categories: categories.map(toCategory),
    units: units.map((u) => ({ ...toUnit(u), icalExportUrl: `${ctx.config.API_URL}ical/${u.ical_token}.ics` })),
    seasons: seasons.map(toSeason),
    bookings: bookings.map(toBooking),
    payments: payments.map(toPayment),
    blocks: blocks.map(toBlock),
    icalChannels: channels.map(toIcal),
    outbox: outbox.map(toOutbox),
    photos,
  };
}

export interface PropertyPatch {
  kind?: PropertyKind;
  lat?: number;
  lng?: number;
  amenities?: string[];
  name?: Localized;
  region?: Localized;
  description?: Localized;
  checkInTime?: string;
  checkOutTime?: string;
  cancellation?: { prepaymentPercent: number; freeCancelDays: number; nonRefundable: boolean };
  paymentMethods?: PaymentMethod[];
  payment?: { qrImage: string | null; recipient: string; details: string; holdHours: number };
  published?: boolean;
}

export async function updateProperty(ctx: Ctx, hostId: string, propertyId: string, patch: PropertyPatch): Promise<void> {
  await assertOwner(ctx.db, hostId, propertyId);
  const sets: string[] = [];
  const vals: unknown[] = [propertyId];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (patch.kind) set('kind', patch.kind);
  if (patch.lat !== undefined) set('lat', patch.lat);
  if (patch.lng !== undefined) set('lng', patch.lng);
  if (patch.amenities) set('amenities', patch.amenities);
  if (patch.name) set('name', JSON.stringify(patch.name));
  if (patch.region) set('region', JSON.stringify(patch.region));
  if (patch.description) set('description', JSON.stringify(patch.description));
  if (patch.checkInTime) set('check_in_time', patch.checkInTime);
  if (patch.checkOutTime) set('check_out_time', patch.checkOutTime);
  if (patch.cancellation) {
    set('prepayment_percent', patch.cancellation.prepaymentPercent);
    set('free_cancel_days', patch.cancellation.freeCancelDays);
    set('non_refundable', patch.cancellation.nonRefundable);
  }
  if (patch.paymentMethods) set('payment_methods', patch.paymentMethods);
  if (patch.payment) {
    set('pay_qr_image', patch.payment.qrImage);
    set('pay_recipient', patch.payment.recipient);
    set('pay_details', patch.payment.details);
    set('hold_hours', patch.payment.holdHours);
  }
  if (patch.published !== undefined) set('published', patch.published);
  if (sets.length) await ctx.db.query(`update properties set ${sets.join(', ')} where id = $1`, vals);
}

async function ownerOf(ctx: Ctx, table: 'categories' | 'units' | 'seasons' | 'blocks' | 'ical_channels', id: string): Promise<string | undefined> {
  const sql =
    table === 'blocks' || table === 'ical_channels'
      ? `select p.owner_id from ${table} t join units u on u.id = t.unit_id join properties p on p.id = u.property_id where t.id = $1`
      : `select p.owner_id from ${table} t join properties p on p.id = t.property_id where t.id = $1`;
  return (await one<{ owner_id: string }>(ctx.db, sql, [id]))?.owner_id;
}

async function assertOwns(ctx: Ctx, hostId: string, table: Parameters<typeof ownerOf>[1], id: string): Promise<void> {
  if ((await ownerOf(ctx, table, id)) !== hostId) notFound();
}

export async function updateCategory(
  ctx: Ctx,
  hostId: string,
  id: string,
  patch: { name?: string; baseOccupancy?: number; basePrice: number; extraGuestPrice: number; minNights: number; capacity: number },
): Promise<void> {
  await assertOwns(ctx, hostId, 'categories', id);
  await ctx.db.query(
    `update categories set base_price = $2, extra_guest_price = $3, min_nights = $4, capacity = $5,
       base_occupancy = least(coalesce($7, base_occupancy), $5),
       name = coalesce($6::jsonb, name) where id = $1`,
    [id, patch.basePrice, patch.extraGuestPrice, patch.minNights, patch.capacity, patch.name ? JSON.stringify({ ru: patch.name, ky: patch.name, en: patch.name }) : null, patch.baseOccupancy ?? null],
  );
}

export async function addCategory(
  ctx: Ctx,
  hostId: string,
  propertyId: string,
  c: { name: string; capacity: number; baseOccupancy: number; basePrice: number; extraGuestPrice: number; minNights: number; units: string[] },
): Promise<string> {
  await assertOwner(ctx.db, hostId, propertyId);
  return tx(ctx.db, async (q) => {
    const id = newId('c');
    const sort = (await one<{ n: number }>(q, 'select coalesce(max(sort), 0) + 1 as n from categories where property_id = $1', [propertyId]))!.n;
    await q.query(
      `insert into categories (id, property_id, name, capacity, base_occupancy, base_price, extra_guest_price, min_nights, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, propertyId, JSON.stringify({ ru: c.name, ky: c.name, en: c.name }), c.capacity, Math.min(c.baseOccupancy, c.capacity), c.basePrice, c.extraGuestPrice, c.minNights, sort],
    );
    for (const [i, name] of c.units.entries()) {
      await q.query('insert into units (id, property_id, category_id, name, sort, ical_token) values ($1,$2,$3,$4,$5,$6)', [
        newId('u'), propertyId, id, name, i, randomToken(18),
      ]);
    }
    return id;
  });
}

/** A room type with bookings stays: history and accounting refer to it. */
export async function removeCategory(ctx: Ctx, hostId: string, id: string): Promise<void> {
  await assertOwns(ctx, hostId, 'categories', id);
  await tx(ctx.db, async (q) => {
    const used = await one(q, 'select 1 from bookings where category_id = $1 limit 1', [id]);
    if (used) throw new ApiError('conflict', 'This room type has bookings', { reason: 'has_bookings' });
    await q.query('delete from units where category_id = $1', [id]);
    await q.query('delete from seasons where category_id = $1', [id]);
    await q.query('delete from categories where id = $1', [id]);
  });
}

export async function addUnit(ctx: Ctx, hostId: string, categoryId: string, name: string): Promise<void> {
  await assertOwns(ctx, hostId, 'categories', categoryId);
  const cat = (await one<{ property_id: string }>(ctx.db, 'select property_id from categories where id = $1', [categoryId]))!;
  const sort = (await one<{ n: number }>(ctx.db, 'select coalesce(max(sort), 0) + 1 as n from units where category_id = $1', [categoryId]))!.n;
  await ctx.db.query('insert into units (id, property_id, category_id, name, sort, ical_token) values ($1,$2,$3,$4,$5,$6)', [
    newId('u'), cat.property_id, categoryId, name, sort, randomToken(18),
  ]);
}

export async function renameUnit(ctx: Ctx, hostId: string, id: string, name: string): Promise<void> {
  await assertOwns(ctx, hostId, 'units', id);
  await ctx.db.query('update units set name = $2 where id = $1', [id, name]);
}

export async function removeUnit(ctx: Ctx, hostId: string, id: string): Promise<void> {
  await assertOwns(ctx, hostId, 'units', id);
  const used = await one(ctx.db, 'select 1 from bookings where unit_id = $1 limit 1', [id]);
  if (used) throw new ApiError('conflict', 'This unit has bookings', { reason: 'has_bookings' });
  await ctx.db.query('delete from units where id = $1', [id]);
}

export async function addSeason(
  ctx: Ctx,
  hostId: string,
  propertyId: string,
  s: { categoryId: string | null; name: string; from: string; to: string; price: number; minNights: number | null },
): Promise<void> {
  await assertOwner(ctx.db, hostId, propertyId);
  if (s.categoryId && (await ownerOf(ctx, 'categories', s.categoryId)) !== hostId) notFound();
  if (s.to < s.from) throw new ApiError('bad_request', 'Season ends before it starts');
  await ctx.db.query(
    'insert into seasons (id, property_id, category_id, name, date_from, date_to, price, min_nights) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [newId('s'), propertyId, s.categoryId, JSON.stringify({ ru: s.name, ky: s.name, en: s.name }), s.from, s.to, s.price, s.minNights],
  );
}

export async function removeSeason(ctx: Ctx, hostId: string, id: string): Promise<void> {
  await assertOwns(ctx, hostId, 'seasons', id);
  await ctx.db.query('delete from seasons where id = $1', [id]);
}

export async function addBlock(ctx: Ctx, hostId: string, unitId: string, b: { from: string; to: string; label: string }): Promise<void> {
  await assertOwns(ctx, hostId, 'units', unitId);
  if (nightsBetween(b.from, b.to) < 1) throw new ApiError('bad_request', 'Block must cover at least one night');
  await tx(ctx.db, async (c) => {
    const unit = (await one<UnitRow>(c, 'select * from units where id = $1', [unitId]))!;
    await c.query('select id from properties where id = $1 for update', [unit.property_id]);
    const bundle = (await loadBundle(c, { id: unit.property_id }, b.from))!;
    const conflicts = conflictsFor(unitId, b.from, b.to, bundle.bookings, bundle.blocks);
    if (conflicts.length) throw new ApiError('dates_taken', 'Unit is taken on these dates', { conflicts });
    await c.query(`insert into blocks (id, unit_id, date_from, date_to, reason, label) values ($1,$2,$3,$4,'closed',$5)`, [
      newId('bl'),
      unitId,
      b.from,
      b.to,
      b.label,
    ]);
  });
}

export async function removeBlock(ctx: Ctx, hostId: string, id: string): Promise<void> {
  await assertOwns(ctx, hostId, 'blocks', id);
  await ctx.db.query(`delete from blocks where id = $1 and reason = 'closed'`, [id]);
}

export async function addIcalChannel(ctx: Ctx, hostId: string, unitId: string, c: { platform: string; importUrl: string }): Promise<string> {
  await assertOwns(ctx, hostId, 'units', unitId);
  const id = newId('ic');
  await ctx.db.query('insert into ical_channels (id, unit_id, platform, import_url) values ($1,$2,$3,$4)', [id, unitId, c.platform, c.importUrl]);
  return id;
}

export async function removeIcalChannel(ctx: Ctx, hostId: string, id: string): Promise<void> {
  await assertOwns(ctx, hostId, 'ical_channels', id);
  await ctx.db.query('delete from ical_channels where id = $1', [id]);
}

export async function assertOwnsChannel(ctx: Ctx, hostId: string, id: string): Promise<void> {
  await assertOwns(ctx, hostId, 'ical_channels', id);
}

/** Stores the owner's Aynes key encrypted and queues all existing bookings once. */
export async function connectAynes(ctx: Ctx, hostId: string, propertyId: string, key: string, shareGuestName: boolean): Promise<void> {
  await assertOwner(ctx.db, hostId, propertyId);
  await tx(ctx.db, async (c) => {
    await c.query('update properties set aynes_key_enc = $2, aynes_key_hint = $3, aynes_share_guest_name = $4 where id = $1', [
      propertyId,
      encrypt(key, ctx.config.SERVER_SECRET),
      key.slice(-4),
      shareGuestName,
    ]);
    await backfill(c, propertyId);
  });
}

export async function disconnectAynes(ctx: Ctx, hostId: string, propertyId: string): Promise<void> {
  await assertOwner(ctx.db, hostId, propertyId);
  await ctx.db.query('update properties set aynes_key_enc = null, aynes_key_hint = null where id = $1', [propertyId]);
  await ctx.db.query(`delete from outbox where property_id = $1 and status = 'pending'`, [propertyId]);
}

export async function setShareGuestName(ctx: Ctx, hostId: string, propertyId: string, share: boolean): Promise<void> {
  await assertOwner(ctx.db, hostId, propertyId);
  await ctx.db.query('update properties set aynes_share_guest_name = $2 where id = $1', [propertyId, share]);
}

export interface NewPropertyInput {
  kind: PropertyKind;
  name: string;
  region: string;
  description: string;
  lat: number;
  lng: number;
  checkInTime: string;
  checkOutTime: string;
  categories: { name: string; capacity: number; baseOccupancy: number; basePrice: number; extraGuestPrice: number; units: string[] }[];
}

function slugify(name: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
    ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const s = name
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'object';
}

/** Onboarding: a property with categories and units in one go. */
export async function createProperty(ctx: Ctx, hostId: string, input: NewPropertyInput): Promise<string> {
  return tx(ctx.db, async (c) => {
    const base = slugify(input.name);
    let slug = base;
    for (let i = 2; await one(c, 'select 1 from properties where slug = $1', [slug]); i++) slug = `${base}-${i}`;
    const id = newId('p');
    const loc = (v: string) => JSON.stringify({ ru: v, ky: v, en: v });
    await c.query(
      `insert into properties (id, slug, owner_id, kind, name, region, description, lat, lng, check_in_time, check_out_time, hue)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, slug, hostId, input.kind, loc(input.name), loc(input.region), loc(input.description), input.lat, input.lng, input.checkInTime, input.checkOutTime, Math.floor(Math.random() * 360)],
    );
    let sort = 0;
    for (const cat of input.categories) {
      const catId = newId('c');
      await c.query(
        `insert into categories (id, property_id, name, capacity, base_occupancy, base_price, extra_guest_price, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [catId, id, loc(cat.name), cat.capacity, Math.min(cat.baseOccupancy, cat.capacity), cat.basePrice, cat.extraGuestPrice, sort++],
      );
      for (const [i, unitName] of cat.units.entries()) {
        await c.query('insert into units (id, property_id, category_id, name, sort, ical_token) values ($1,$2,$3,$4,$5,$6)', [
          newId('u'),
          id,
          catId,
          unitName,
          i,
          randomToken(18),
        ]);
      }
    }
    return id;
  });
}
