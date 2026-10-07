import { rangesOverlap } from './dates';
import type { Block, Booking, BookingStatus, IsoDate, Unit } from './types';

/** Statuses that hold the unit. Cancelled and no-show free it. */
export const HOLDING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out'];

export function holdsUnit(b: Booking): boolean {
  return HOLDING_STATUSES.includes(b.status);
}

export interface Conflict {
  kind: 'booking' | 'block';
  id: string;
  label: string;
}

/** Everything that already occupies the unit on any night of [from, to). */
export function conflictsFor(
  unitId: string,
  from: IsoDate,
  to: IsoDate,
  bookings: Booking[],
  blocks: Block[],
  ignoreBookingId?: string,
): Conflict[] {
  const fromBookings = bookings
    .filter((b) => b.unitId === unitId && b.id !== ignoreBookingId && holdsUnit(b))
    .filter((b) => rangesOverlap(from, to, b.checkIn, b.checkOut))
    .map((b): Conflict => ({ kind: 'booking', id: b.id, label: b.guestName || b.id }));
  const fromBlocks = blocks
    .filter((bl) => bl.unitId === unitId && rangesOverlap(from, to, bl.from, bl.to))
    .map((bl): Conflict => ({ kind: 'block', id: bl.id, label: bl.label }));
  return [...fromBookings, ...fromBlocks];
}

/** Free units of a category for the stay, in a stable order. */
export function freeUnits(
  units: Unit[],
  categoryId: string,
  from: IsoDate,
  to: IsoDate,
  bookings: Booking[],
  blocks: Block[],
): Unit[] {
  return units
    .filter((u) => u.categoryId === categoryId)
    .filter((u) => conflictsFor(u.id, from, to, bookings, blocks).length === 0);
}
