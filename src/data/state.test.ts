import { describe, expect, it } from 'vitest';
import { addDays, todayIn } from '../domain/dates';
import { addPayment, createBooking, initialState, updateBooking, type NewBooking } from './state';

const now = new Date('2027-06-01T06:00:00Z');
const NOW = '2027-06-01T12:00:00+06:00';

function input(patch: Partial<NewBooking> = {}): NewBooking {
  const today = todayIn('Asia/Bishkek', now);
  return {
    propertyId: 'p-sonkul',
    unitId: 'u-sk-4',
    categoryId: 'c-sk-std',
    checkIn: addDays(today, 20),
    checkOut: addDays(today, 22),
    guests: 2,
    guestName: 'Айгерим',
    guestPhone: '+996 555 123 456',
    channel: 'whatsapp',
    status: 'confirmed',
    currency: 'KGS',
    total: 700000,
    prepaymentDue: 210000,
    nonRefundablePrepayment: false,
    note: '',
    createdBy: 'host',
    ...patch,
  };
}

describe('state', () => {
  it('creates a booking and queues it for Aynes without the phone', () => {
    const r = createBooking(initialState(now), input(), NOW);
    if (!r.ok) throw new Error('expected ok');
    const item = r.state.outbox.at(-1)!;
    expect(item.path).toBe(`/api/v1/bookings/voyz/${r.booking.id}`);
    expect(item.body).toMatchObject({ version: 1, status: 'confirmed', propertyRef: 'son-kul-aiyl', total: 700000, guestName: 'Айгерим' });
    expect(JSON.stringify(item.body)).not.toContain('555');
  });

  it('rejects a second booking of the same yurt', () => {
    const r1 = createBooking(initialState(now), input(), NOW);
    if (!r1.ok) throw new Error('expected ok');
    const r2 = createBooking(r1.state, input({ guestName: 'B' }), NOW);
    expect(r2.ok).toBe(false);
  });

  it('bumps the version on every change and keeps one pending PUT per booking', () => {
    const r = createBooking(initialState(now), input(), NOW);
    if (!r.ok) throw new Error('expected ok');
    let s = updateBooking(r.state, r.booking.id, { status: 'checked_in' }, NOW);
    s = updateBooking(s, r.booking.id, { status: 'checked_out' }, NOW);
    const b = s.bookings.find((x) => x.id === r.booking.id)!;
    expect(b.version).toBe(3);
    const puts = s.outbox.filter((o) => o.path.endsWith(r.booking.id));
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toMatchObject({ version: 3, status: 'checked_out' });
  });

  it('queues payments with zero fee on refunds', () => {
    const r = createBooking(initialState(now), input(), NOW);
    if (!r.ok) throw new Error('expected ok');
    const s = addPayment(r.state, {
      bookingId: r.booking.id,
      kind: 'refund',
      method: 'cash',
      provider: null,
      amount: 100000,
      fee: 500,
      currency: 'KGS',
      paidAt: NOW,
      status: 'succeeded',
    });
    const item = s.outbox.at(-1)!;
    expect(item.path).toMatch(/\/payments\/P-\d+$/);
    expect(item.body).toMatchObject({ kind: 'refund', fee: 0, amount: 100000 });
  });
});
