import { describe, expect, it } from 'vitest';
import { conflictsFor, freeUnits } from './availability';
import { addDays, eachNight, nightsBetween, nowWithOffset, rangesOverlap, todayIn } from './dates';
import { bookingMoney } from './ledger';
import { formatMoney, parseMajor, percentOf } from './money';
import { quoteStay, refundOnCancel, validateStay } from './pricing';
import type { Block, Booking, Category, Season, Unit } from './types';

const category: Category = {
  id: 'c1',
  propertyId: 'p1',
  name: { ru: 'Юрта', ky: 'Боз үй', en: 'Yurt' },
  capacity: 4,
  baseOccupancy: 2,
  basePrice: 300000,
  extraGuestPrice: 50000,
  minNights: 1,
};

const policy = { prepaymentPercent: 30, freeCancelDays: 7, nonRefundable: false };

const booking = (patch: Partial<Booking>): Booking => ({
  id: 'VZ-1',
  version: 1,
  propertyId: 'p1',
  unitId: 'u1',
  categoryId: 'c1',
  checkIn: '2027-07-10',
  checkOut: '2027-07-13',
  guests: 2,
  guestName: 'A',
  guestPhone: '',
  channel: 'voyz',
  status: 'confirmed',
  currency: 'KGS',
  total: 900000,
  prepaymentDue: 270000,
  nonRefundablePrepayment: false,
  note: '',
  createdAt: '',
  updatedAt: '',
  cancelledAt: null,
  cancelReason: null,
  createdBy: 'guest',
  source: null,
  holdUntil: null,
  guestReportedPaidAt: null,
  ...patch,
});

describe('dates', () => {
  it('counts nights and walks across month ends', () => {
    expect(nightsBetween('2027-06-29', '2027-07-02')).toBe(3);
    expect(eachNight('2027-06-30', '2027-07-02')).toEqual(['2027-06-30', '2027-07-01']);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('treats check-out day as free for the next check-in', () => {
    expect(rangesOverlap('2027-07-10', '2027-07-13', '2027-07-13', '2027-07-15')).toBe(false);
    expect(rangesOverlap('2027-07-10', '2027-07-13', '2027-07-12', '2027-07-15')).toBe(true);
  });

  it('uses the property time zone for today and the offset', () => {
    const lateUtc = new Date('2027-06-01T20:30:00Z'); // 02:30 next day in Bishkek (+06)
    expect(todayIn('Asia/Bishkek', lateUtc)).toBe('2027-06-02');
    expect(nowWithOffset('Asia/Bishkek', lateUtc)).toBe('2027-06-02T02:30:00+06:00');
  });
});

describe('money', () => {
  it('keeps integer minor units', () => {
    expect(parseMajor('1 500')).toBe(150000);
    expect(parseMajor('1500,5')).toBe(150050);
    expect(parseMajor('abc')).toBeNull();
    expect(percentOf(1050000, 30)).toBe(315000);
    expect(formatMoney(1800000, 'KGS', 'en')).toBe('18,000 сом');
  });
});

describe('pricing', () => {
  const seasons: Season[] = [
    { id: 's1', propertyId: 'p1', categoryId: null, name: category.name, from: '2027-07-01', to: '2027-08-31', price: 400000, minNights: 2 },
  ];

  it('prices each night by season and adds extra guests', () => {
    const q = quoteStay(category, seasons, '2027-06-30', '2027-07-02', 3, policy);
    expect(q.nights.map((n) => n.price)).toEqual([300000, 400000]);
    expect(q.extraGuestTotal).toBe(100000);
    expect(q.total).toBe(800000);
    expect(q.prepaymentDue).toBe(240000);
    expect(q.minNights).toBe(2);
  });

  it('enforces seasonal minimum stay and capacity', () => {
    const q = quoteStay(category, seasons, '2027-07-05', '2027-07-06', 2, policy);
    expect(validateStay(category, q, '2027-07-05', '2027-07-06', 2)).toBe('too_short');
    expect(validateStay(category, q, '2027-07-05', '2027-07-06', 5)).toBe('too_many_guests');
  });

  it('refunds according to the property rules', () => {
    expect(refundOnCancel(policy, 270000, '2027-07-10', '2027-07-01')).toBe(270000);
    expect(refundOnCancel(policy, 270000, '2027-07-10', '2027-07-05')).toBe(0);
    expect(refundOnCancel({ ...policy, nonRefundable: true }, 270000, '2027-07-10', '2027-06-01')).toBe(0);
  });
});

describe('availability', () => {
  const units: Unit[] = [
    { id: 'u1', propertyId: 'p1', categoryId: 'c1', name: '1' },
    { id: 'u2', propertyId: 'p1', categoryId: 'c1', name: '2' },
  ];
  const blocks: Block[] = [{ id: 'b1', unitId: 'u2', from: '2027-07-11', to: '2027-07-12', reason: 'ical', label: 'Booking.com' }];

  it('never sells one yurt twice, including OTA blocks', () => {
    const bookings = [booking({})];
    expect(conflictsFor('u1', '2027-07-12', '2027-07-14', bookings, blocks)).toHaveLength(1);
    expect(freeUnits(units, 'c1', '2027-07-10', '2027-07-12', bookings, blocks)).toEqual([]);
    expect(freeUnits(units, 'c1', '2027-07-13', '2027-07-15', bookings, blocks).map((u) => u.id)).toEqual(['u1', 'u2']);
  });

  it('frees the unit when a booking is cancelled', () => {
    const bookings = [booking({ status: 'cancelled' })];
    expect(conflictsFor('u1', '2027-07-10', '2027-07-13', bookings, blocks)).toEqual([]);
  });
});

describe('ledger', () => {
  it('sums payments and refunds per booking', () => {
    const b = booking({});
    const money = bookingMoney(b, [
      { id: 'p1', bookingId: 'VZ-1', kind: 'prepayment', method: 'qr', provider: null, amount: 270000, fee: 0, currency: 'KGS', paidAt: '', status: 'succeeded' },
      { id: 'p2', bookingId: 'VZ-1', kind: 'payment', method: 'cash', provider: null, amount: 100000, fee: 0, currency: 'KGS', paidAt: '', status: 'cancelled' },
      { id: 'p3', bookingId: 'VZ-2', kind: 'payment', method: 'cash', provider: null, amount: 999, fee: 0, currency: 'KGS', paidAt: '', status: 'succeeded' },
    ]);
    expect(money).toEqual({ paid: 270000, refunded: 0, balance: 630000, prepaymentCovered: true });
  });
});
