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
import type { Catalog, HostSnapshot } from '../api/types';
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
  // Server mode only (VITE_API_URL): per-property Aynes state, iCal feed links, signed-in host.
  aynesByProperty?: Record<string, AynesSettings>;
  icalUrls?: Record<string, string>;
  host?: { id: string; name: string } | null;
  /** Server mode: whose data the state holds right now. */
  view?: 'guest' | 'host';
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

/** Server workspace replaces the host part of the state. */
export function applySnapshot(state: AppState, snap: HostSnapshot): AppState {
  return {
    ...state,
    view: 'host',
    hostId: snap.host.id,
    host: { id: snap.host.id, name: snap.host.name },
    properties: snap.properties.map(({ aynes: _a, ...p }) => p),
    aynesByProperty: Object.fromEntries(snap.properties.map((p) => [p.id, p.aynes])),
    categories: snap.categories,
    units: snap.units.map(({ icalExportUrl: _u, ...u }) => u),
    icalUrls: Object.fromEntries(snap.units.map((u) => [u.id, u.icalExportUrl])),
    seasons: snap.seasons,
    bookings: snap.bookings,
    payments: snap.payments,
    blocks: snap.blocks,
    icalChannels: snap.icalChannels,
    outbox: snap.outbox,
  };
}

/** Public catalog for guests: other people's bookings arrive only as busy nights. */
export function applyCatalog(state: AppState, cat: Catalog): AppState {
  return {
    ...state,
    view: 'guest',
    properties: cat.properties.map((p) => ({
      ...p,
      ownerId: '',
      payment: { qrImage: null, recipient: '', details: '', holdHours: p.payment.holdHours },
    })),
    categories: cat.categories,
    units: cat.units,
    seasons: cat.seasons,
    bookings: [],
    payments: [],
    blocks: cat.occupancy.map((o, i) => ({ id: `occ-${i}`, unitId: o.unitId, from: o.from, to: o.to, reason: 'closed' as const, label: '' })),
    icalChannels: [],
  };
}

export interface NewPropertyInput {
  kind: Property['kind'];
  name: string;
  region: string;
  description: string;
  checkInTime: string;
  checkOutTime: string;
  categories: { name: string; capacity: number; baseOccupancy: number; basePrice: number; extraGuestPrice: number; units: string[] }[];
}

/** Demo mode onboarding — same shape the server creates. */
export function createProperty(state: AppState, input: NewPropertyInput): { state: AppState; propertyId: string } {
  let seq = state.seq;
  const id = `p-${++seq}`;
  const loc = (v: string) => ({ ru: v, ky: v, en: v });
  const base = input.name.toLowerCase().replace(/[^a-z0-9а-яёүөң]+/gi, '-').replace(/^-|-$/g, '') || 'object';
  let slug = base;
  for (let i = 2; state.properties.some((p) => p.slug === slug); i++) slug = `${base}-${i}`;
  const property: Property = {
    id,
    slug,
    ownerId: state.hostId,
    kind: input.kind,
    name: loc(input.name),
    region: loc(input.region),
    description: loc(input.description),
    lat: 0,
    lng: 0,
    timezone: 'Asia/Bishkek',
    currency: 'KGS',
    checkInTime: input.checkInTime,
    checkOutTime: input.checkOutTime,
    cancellation: { prepaymentPercent: 0, freeCancelDays: 0, nonRefundable: false },
    paymentMethods: ['cash'],
    amenities: [],
    hue: (seq * 47) % 360,
    payment: { qrImage: null, recipient: '', details: '', holdHours: 24 },
  };
  const categories: Category[] = [];
  const units: AppState['units'] = [];
  for (const c of input.categories) {
    const catId = `c-${++seq}`;
    categories.push({ id: catId, propertyId: id, name: loc(c.name), capacity: c.capacity, baseOccupancy: Math.min(c.baseOccupancy, c.capacity), basePrice: c.basePrice, extraGuestPrice: c.extraGuestPrice, minNights: 1 });
    for (const name of c.units) units.push({ id: `u-${++seq}`, propertyId: id, categoryId: catId, name });
  }
  return {
    propertyId: id,
    state: { ...state, seq, properties: [...state.properties, property], categories: [...state.categories, ...categories], units: [...state.units, ...units] },
  };
}

// ---------- Editing room types and units (demo mode; the server enforces the same rules) ----------

export function addCategoryWithUnits(
  state: AppState,
  propertyId: string,
  c: { name: string; capacity: number; baseOccupancy: number; basePrice: number; extraGuestPrice: number; minNights: number; units: string[] },
): AppState {
  let seq = state.seq;
  const id = `c-${++seq}`;
  const units = c.units.map((name) => ({ id: `u-${++seq}`, propertyId, categoryId: id, name }));
  return {
    ...state,
    seq,
    categories: [
      ...state.categories,
      { id, propertyId, name: { ru: c.name, ky: c.name, en: c.name }, capacity: c.capacity, baseOccupancy: Math.min(c.baseOccupancy, c.capacity), basePrice: c.basePrice, extraGuestPrice: c.extraGuestPrice, minNights: c.minNights },
    ],
    units: [...state.units, ...units],
  };
}

/** Room types and units that have bookings stay — history and accounting refer to them. */
export function removeCategoryIfFree(state: AppState, id: string): AppState | null {
  if (state.bookings.some((b) => b.categoryId === id)) return null;
  return {
    ...state,
    categories: state.categories.filter((c) => c.id !== id),
    units: state.units.filter((u) => u.categoryId !== id),
    seasons: state.seasons.filter((s) => s.categoryId !== id),
  };
}

export function addUnit(state: AppState, categoryId: string, name: string): AppState {
  const cat = state.categories.find((c) => c.id === categoryId);
  if (!cat) return state;
  const seq = state.seq + 1;
  return { ...state, seq, units: [...state.units, { id: `u-${seq}`, propertyId: cat.propertyId, categoryId, name }] };
}

export function renameUnit(state: AppState, id: string, name: string): AppState {
  return { ...state, units: state.units.map((u) => (u.id === id ? { ...u, name } : u)) };
}

export function removeUnitIfFree(state: AppState, id: string): AppState | null {
  if (state.bookings.some((b) => b.unitId === id)) return null;
  return { ...state, units: state.units.filter((u) => u.id !== id), blocks: state.blocks.filter((b) => b.unitId !== id) };
}
