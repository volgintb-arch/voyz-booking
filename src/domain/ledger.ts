import type { Booking, Payment } from './types';

export interface BookingMoney {
  paid: number; // succeeded prepayments and payments
  refunded: number;
  balance: number; // still to collect from the guest
  prepaymentCovered: boolean;
}

export function bookingMoney(booking: Booking, payments: Payment[]): BookingMoney {
  const own = payments.filter((p) => p.bookingId === booking.id && p.status === 'succeeded');
  const paid = own.filter((p) => p.kind !== 'refund').reduce((s, p) => s + p.amount, 0);
  const refunded = own.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0);
  return {
    paid,
    refunded,
    balance: Math.max(0, booking.total - paid),
    prepaymentCovered: paid >= booking.prepaymentDue,
  };
}

/** Colour bucket on the host's chessboard (PRD §6, screen 1). */
export type BoardTone = 'paid' | 'pending' | 'confirmed' | 'stay' | 'ical' | 'closed';

export function boardTone(booking: Booking, money: BookingMoney): BoardTone {
  if (booking.status === 'pending') return 'pending';
  if (booking.status === 'checked_in' || booking.status === 'checked_out') return 'stay';
  return money.paid > 0 && money.prepaymentCovered ? 'paid' : 'confirmed';
}
