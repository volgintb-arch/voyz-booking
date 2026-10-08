// Pure state transitions. Every change to a booking bumps its version and
// queues a PUT to Aynes, so the owner's books follow without manual work.

import { conflictsFor, type Conflict } from '../domain/availability';
import type {
  Block,
  Booking,
  Category,
  IcalChannel,
  Lang,
  OutboxItem,
  Payment,
  Property,
  Season,
} from '../domain/types';
import { bookingPath, enqueue, paymentPath, toAynesBooking, toAynesPayment } from '../integrations/aynes';
import { buildSeed, DEMO_HOST_ID, type SeedData } from './seed';

export interface AynesSettings {
  connected: boolean;
  keyHint: string | null; // last 4 chars only; the key itself lives on the server
  shareGuestName: boolean;
}

export interface AppState extends SeedData {
  schema: 2;
  lang: Lang;
  hostId: string;
  guestBookingIds: string[]; // bookings made by the guest on this device
  outbox: OutboxItem[];
  aynes: AynesSettings;
  seq: number;
}

export function initialState(now: Date = new Date()): AppState {
  return {
    schema: 2,
    ...buildSeed(now),
    lang: 'ru',
    hostId: DEMO_HOST_ID,
    guestBookingIds: [],
    outbox: [],
    aynes: { connected: false, keyHint: null, shareGuestName: true },
    seq: 100,
  };
}

function queueBooking(state: AppState, booking: Booking, now: string): OutboxItem[] {
  const property = state.properties.find((p) => p.id === booking.propertyId);
  const unit = state.units.find((u) => u.id === booking.unitId);
  const category = state.categories.find((c) => c.id === booking.categoryId);
  if (!property || !unit || !category) return state.outbox;
  const body = toAynesBooking(booking, property, unit, category, state.aynes.shareGuestName);
  return enqueue(state.outbox, bookingPath(booking.id), body, now);
}

export type NewBooking = Omit<
  Booking,
  'id' | 'version' | 'createdAt' | 'updatedAt' | 'cancelledAt' | 'cancelReason' | 'holdUntil' | 'guestReportedPaidAt'
>;

function plusHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

export type CreateResult =
  | { ok: true; state: AppState; booking: Booking }
  | { ok: false; conflicts: Conflict[] };

export function createBooking(state: AppState, input: NewBooking, now: string): CreateResult {
  const conflicts = conflictsFor(input.unitId, input.checkIn, input.checkOut, state.bookings, state.blocks);
  if (conflicts.length > 0) return { ok: false, conflicts };
  const seq = state.seq + 1;
  const property = state.properties.find((p) => p.id === input.propertyId);
  // A guest booking with a deposit holds the unit only until the deadline (D-001).
  const needsHold = input.createdBy === 'guest' && input.status === 'pending' && input.prepaymentDue > 0;
  const booking: Booking = {
    ...input,
    id: `VZ-${input.checkIn.slice(0, 4)}-${String(seq).padStart(4, '0')}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    cancelReason: null,
    holdUntil: needsHold ? plusHours(now, property?.payment.holdHours ?? 24) : null,
    guestReportedPaidAt: null,
  };
  const next: AppState = {
    ...state,
    seq,
    bookings: [...state.bookings, booking],
    guestBookingIds: input.createdBy === 'guest' ? [...state.guestBookingIds, booking.id] : state.guestBookingIds,
  };
  return { ok: true, booking, state: { ...next, outbox: queueBooking(next, booking, now) } };
}

export function updateBooking(
  state: AppState,
  id: string,
  patch: Partial<Pick<Booking, 'status' | 'note' | 'guests' | 'total' | 'cancelReason'>>,
  now: string,
): AppState {
  const current = state.bookings.find((b) => b.id === id);
  if (!current) return state;
  const cancelling = patch.status === 'cancelled' && current.status !== 'cancelled';
  const updated: Booking = {
    ...current,
    ...patch,
    version: current.version + 1,
    updatedAt: now,
    cancelledAt: cancelling ? now : current.cancelledAt,
    // Confirming means the host accepts the booking: no automatic release any more.
    holdUntil: patch.status && patch.status !== 'pending' ? null : current.holdUntil,
  };
  const next = { ...state, bookings: state.bookings.map((b) => (b.id === id ? updated : b)) };
  return { ...next, outbox: queueBooking(next, updated, now) };
}

export { NEXT_STATUSES } from '../domain/status';

export function addPayment(state: AppState, payment: Omit<Payment, 'id'>): AppState {
  const seq = state.seq + 1;
  const full: Payment = { ...payment, id: `P-${seq}` };
  return {
    ...state,
    seq,
    payments: [...state.payments, full],
    outbox: enqueue(state.outbox, paymentPath(full.bookingId, full.id), toAynesPayment(full), payment.paidAt),
  };
}

export function addBlock(state: AppState, block: Omit<Block, 'id'>): { ok: true; state: AppState } | { ok: false; conflicts: Conflict[] } {
  const conflicts = conflictsFor(block.unitId, block.from, block.to, state.bookings, state.blocks);
  if (conflicts.length > 0) return { ok: false, conflicts };
  const seq = state.seq + 1;
  return { ok: true, state: { ...state, seq, blocks: [...state.blocks, { ...block, id: `bl-${seq}` }] } };
}

export function removeBlock(state: AppState, id: string): AppState {
  return { ...state, blocks: state.blocks.filter((b) => b.id !== id) };
}

export function updateCategory(state: AppState, id: string, patch: Partial<Category>): AppState {
  return { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, ...patch, id } : c)) };
}

export function updateProperty(state: AppState, id: string, patch: Partial<Property>): AppState {
  return { ...state, properties: state.properties.map((p) => (p.id === id ? { ...p, ...patch, id } : p)) };
}

export function addSeason(state: AppState, season: Omit<Season, 'id'>): AppState {
  const seq = state.seq + 1;
  return { ...state, seq, seasons: [...state.seasons, { ...season, id: `s-${seq}` }] };
}

export function removeSeason(state: AppState, id: string): AppState {
  return { ...state, seasons: state.seasons.filter((s) => s.id !== id) };
}

export function addIcalChannel(state: AppState, channel: Omit<IcalChannel, 'id' | 'lastSyncAt'>): AppState {
  const seq = state.seq + 1;
  return { ...state, seq, icalChannels: [...state.icalChannels, { ...channel, id: `ic-${seq}`, lastSyncAt: null }] };
}

export function removeIcalChannel(state: AppState, id: string): AppState {
  return { ...state, icalChannels: state.icalChannels.filter((c) => c.id !== id) };
}

export function markOutbox(state: AppState, id: string, result: { ok: true } | { ok: false; error: string }): AppState {
  return {
    ...state,
    outbox: state.outbox.map((o) =>
      o.id === id
        ? { ...o, attempts: o.attempts + 1, status: result.ok ? 'sent' : 'failed', lastError: result.ok ? null : result.error }
        : o,
    ),
  };
}

/** Guest pressed "I have paid": the host still has to see the money. */
export function reportPaid(state: AppState, id: string, now: string): AppState {
  return {
    ...state,
    bookings: state.bookings.map((b) => (b.id === id ? { ...b, guestReportedPaidAt: now } : b)),
  };
}

/** Host saw the deposit on the account: record it and confirm the booking. */
export function confirmDepositReceived(
  state: AppState,
  id: string,
  method: Payment['method'],
  provider: string | null,
  now: string,
): AppState {
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) return state;
  const paid = state.payments
    .filter((p) => p.bookingId === id && p.status === 'succeeded' && p.kind !== 'refund')
    .reduce((s, p) => s + p.amount, 0);
  const due = Math.max(0, booking.prepaymentDue - paid);
  let next = state;
  if (due > 0) {
    next = addPayment(next, {
      bookingId: id,
      kind: 'prepayment',
      method,
      provider,
      amount: due,
      fee: 0,
      currency: booking.currency,
      paidAt: now,
      status: 'succeeded',
    });
  }
  return booking.status === 'pending' ? updateBooking(next, id, { status: 'confirmed' }, now) : next;
}

export function extendHold(state: AppState, id: string, hours: number): AppState {
  return {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === id && b.holdUntil ? { ...b, holdUntil: plusHours(new Date(Math.max(Date.parse(b.holdUntil), Date.now())).toISOString(), hours) } : b,
    ),
  };
}

/** Releases pending bookings whose deposit did not arrive in time. */
export function expireHolds(state: AppState, now: Date, nowIso: string): AppState {
  const expired = state.bookings.filter((b) => {
    if (b.status !== 'pending' || !b.holdUntil || Date.parse(b.holdUntil) > now.getTime()) return false;
    const paid = state.payments
      .filter((p) => p.bookingId === b.id && p.status === 'succeeded' && p.kind !== 'refund')
      .reduce((s, p) => s + p.amount, 0);
    return paid < b.prepaymentDue;
  });
  return expired.reduce((s, b) => updateBooking(s, b.id, { status: 'cancelled', cancelReason: 'hold_expired' }, nowIso), state);
}
