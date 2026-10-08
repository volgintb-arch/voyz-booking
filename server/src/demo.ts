// Demo data for the pilot and tests: the same four properties the app shows offline.

import { buildSeed, DEMO_HOST_ID } from '../../src/data/seed';
import { randomToken } from './crypto';
import { tx, type Db } from './db';

const DEMO_HOSTS = [DEMO_HOST_ID, 'host-2'];

export async function seedDemo(db: Db, now = new Date()): Promise<boolean> {
  const exists = await db.query('select 1 from properties limit 1');
  if (exists.rowCount) return false;
  const s = buildSeed(now);
  await tx(db, async (c) => {
    await c.query(`insert into hosts (id, name, lang) values ($1, 'Демо-хозяин', 'ru'), ($2, 'Демо-хозяин 2', 'ru')
                   on conflict (id) do nothing`, DEMO_HOSTS);
    for (const p of s.properties) {
      await c.query(
        `insert into properties (id, slug, owner_id, kind, name, region, description, lat, lng, timezone, currency, check_in_time,
           check_out_time, prepayment_percent, free_cancel_days, non_refundable, payment_methods, amenities, hue,
           pay_qr_image, pay_recipient, pay_details, hold_hours)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          p.id, p.slug, p.ownerId, p.kind, JSON.stringify(p.name), JSON.stringify(p.region), JSON.stringify(p.description), p.lat, p.lng,
          p.timezone, p.currency, p.checkInTime, p.checkOutTime, p.cancellation.prepaymentPercent, p.cancellation.freeCancelDays,
          p.cancellation.nonRefundable, p.paymentMethods, p.amenities, p.hue, p.payment.qrImage, p.payment.recipient, p.payment.details,
          p.payment.holdHours,
        ],
      );
    }
    for (const [i, cat] of s.categories.entries()) {
      await c.query(
        `insert into categories (id, property_id, name, capacity, base_occupancy, base_price, extra_guest_price, min_nights, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [cat.id, cat.propertyId, JSON.stringify(cat.name), cat.capacity, cat.baseOccupancy, cat.basePrice, cat.extraGuestPrice, cat.minNights, i],
      );
    }
    for (const [i, u] of s.units.entries()) {
      await c.query('insert into units (id, property_id, category_id, name, sort, ical_token) values ($1,$2,$3,$4,$5,$6)', [
        u.id, u.propertyId, u.categoryId, u.name, i, randomToken(18),
      ]);
    }
    for (const se of s.seasons) {
      await c.query(
        'insert into seasons (id, property_id, category_id, name, date_from, date_to, price, min_nights) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [se.id, se.propertyId, se.categoryId, JSON.stringify(se.name), se.from, se.to, se.price, se.minNights],
      );
    }
    for (const b of s.bookings) {
      await c.query(
        `insert into bookings (id, version, property_id, unit_id, category_id, check_in, check_out, guests, guest_name, guest_phone, channel,
           status, currency, total, prepayment_due, non_refundable_prepayment, note, created_at, updated_at, created_by, source, hold_until,
           guest_reported_paid_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          b.id, b.version, b.propertyId, b.unitId, b.categoryId, b.checkIn, b.checkOut, b.guests, b.guestName, b.guestPhone, b.channel,
          b.status, b.currency, b.total, b.prepaymentDue, b.nonRefundablePrepayment, b.note, b.createdAt, b.updatedAt, b.createdBy,
          b.source, b.holdUntil, b.guestReportedPaidAt,
        ],
      );
    }
    for (const p of s.payments) {
      await c.query(
        `insert into payments (id, booking_id, kind, method, provider, amount, fee, currency, paid_at, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.id, p.bookingId, p.kind, p.method, p.provider, p.amount, p.fee, p.currency, p.paidAt, p.status],
      );
    }
    for (const bl of s.blocks) {
      await c.query(`insert into blocks (id, unit_id, date_from, date_to, reason, label) values ($1,$2,$3,$4,$5,$6)`, [
        bl.id, bl.unitId, bl.from, bl.to, bl.reason, bl.label,
      ]);
    }
  });
  return true;
}

/**
 * Real hosts only (ALLOW_DEV_LOGIN=false): the demo properties and everything booked
 * on them go away, so guests never book a yurt that does not exist. Telegram hosts
 * have generated ids and are never touched.
 */
export async function removeDemo(db: Db): Promise<number> {
  return tx(db, async (c) => {
    const props = `select id from properties where owner_id = any($1)`;
    await c.query(`delete from bookings where property_id in (${props})`, [DEMO_HOSTS]);
    const r = await c.query('delete from properties where owner_id = any($1)', [DEMO_HOSTS]);
    await c.query('delete from hosts where id = any($1)', [DEMO_HOSTS]);
    return r.rowCount ?? 0;
  });
}
