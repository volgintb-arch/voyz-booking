import type { BookingStatus } from './types';

/** Status changes the host may make from each status. */
export const NEXT_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'no_show', 'cancelled'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
};
