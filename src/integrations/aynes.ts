// Payloads for the Aynes bookings API (BOOKINGS_API.md §4.1–§4.2).
// Only what Aynes needs: no phone, no documents (personal data minimum).

import type { Booking, Category, OutboxItem, Payment, Property, Unit } from '../domain/types';

export const AYNES_SOURCE = 'voyz';

export interface AynesBookingBody {
  version: number;
  status: Booking['status'];
  propertyRef: string;
  unitRef: string;
  categoryRef: string;
  channel: Booking['channel'];
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName?: string;
  currency: Booking['currency'];
  total: number;
  channelCommission: number;
  nonRefundablePrepayment: boolean;
  updatedAt: string;
  cancelledAt?: string;
  note?: string;
}

export interface AynesPaymentBody {
  kind: Payment['kind'];
  method: Payment['method'];
  provider?: string;
  amount: number;
  fee: number;
  currency: Payment['currency'];
  paidAt: string;
  status: Payment['status'];
}

export function bookingPath(bookingId: string): string {
  return `/api/v1/bookings/${AYNES_SOURCE}/${encodeURIComponent(bookingId)}`;
}

export function paymentPath(bookingId: string, paymentId: string): string {
  return `${bookingPath(bookingId)}/payments/${encodeURIComponent(paymentId)}`;
}

export function toAynesBooking(
  booking: Booking,
  property: Property,
  unit: Unit,
  category: Category,
  shareGuestName: boolean,
): AynesBookingBody {
  return {
    version: booking.version,
    status: booking.status,
    propertyRef: property.slug,
    unitRef: unit.id,
    categoryRef: category.id,
    channel: booking.channel,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.guests,
    ...(shareGuestName && booking.guestName ? { guestName: booking.guestName } : {}),
    currency: booking.currency,
    total: booking.total,
    channelCommission: 0,
    nonRefundablePrepayment: booking.nonRefundablePrepayment,
    updatedAt: booking.updatedAt,
    ...(booking.cancelledAt ? { cancelledAt: booking.cancelledAt } : {}),
    ...(booking.note ? { note: booking.note } : {}),
  };
}

export function toAynesPayment(payment: Payment): AynesPaymentBody {
  return {
    kind: payment.kind,
    method: payment.method,
    ...(payment.provider ? { provider: payment.provider } : {}),
    amount: payment.amount,
    fee: payment.kind === 'refund' ? 0 : payment.fee,
    currency: payment.currency,
    paidAt: payment.paidAt,
    status: payment.status,
  };
}

/**
 * New outbox item. A later PUT to the same path replaces a still-pending one:
 * requests are idempotent and only the latest state of a booking matters.
 */
export function enqueue(outbox: OutboxItem[], path: string, body: unknown, now: string): OutboxItem[] {
  const item: OutboxItem = {
    id: `${path}#${now}`,
    method: 'PUT',
    path,
    body,
    createdAt: now,
    attempts: 0,
    status: 'pending',
    lastError: null,
  };
  return [...outbox.filter((o) => !(o.path === path && o.status !== 'sent')), item];
}

export type SendResult = { ok: true } | { ok: false; error: string; retry: boolean };

/**
 * Transport to Aynes. In this frontend-only build it is a stub:
 * the real call goes through the Voyz backend, which keeps the owner's
 * Aynes key encrypted (TZ §7) — the key never lives on the phone.
 */
export async function sendToAynes(_item: OutboxItem, connected: boolean): Promise<SendResult> {
  await new Promise((r) => setTimeout(r, 250));
  if (!connected) return { ok: false, error: 'not_connected', retry: false };
  return { ok: true };
}
