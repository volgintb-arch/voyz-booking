// Bookings and payments go to Aynes through a durable queue (BOOKINGS_API.md §4).
// PUTs are idempotent, so only the latest pending request per path is kept.

import type { Booking, Payment } from '../../../src/domain/types';
import { bookingPath, paymentPath, toAynesBooking, toAynesPayment } from '../../../src/integrations/aynes';
import type { Ctx } from '../context';
import { decrypt } from '../crypto';
import { many, one, tx, type Queryable } from '../db';
import {
  toBooking,
  toCategory,
  toPayment,
  toProperty,
  toUnit,
  type BookingRow,
  type CategoryRow,
  type OutboxRow,
  type PaymentRow,
  type PropertyRow,
  type UnitRow,
} from '../model';

async function put(q: Queryable, propertyId: string, path: string, body: unknown): Promise<void> {
  await q.query(`delete from outbox where path = $1 and status = 'pending'`, [path]);
  await q.query('insert into outbox(property_id, path, body) values ($1, $2, $3)', [propertyId, path, JSON.stringify(body)]);
}

/** Queues the booking's current state if the owner connected Aynes. */
export async function enqueueBooking(q: Queryable, booking: Booking): Promise<void> {
  const p = await one<PropertyRow>(q, 'select * from properties where id = $1', [booking.propertyId]);
  if (!p?.aynes_key_enc) return;
  const unit = await one<UnitRow>(q, 'select * from units where id = $1', [booking.unitId]);
  const category = await one<CategoryRow>(q, 'select * from categories where id = $1', [booking.categoryId]);
  if (!unit || !category) return;
  const body = toAynesBooking(booking, toProperty(p), toUnit(unit), toCategory(category), p.aynes_share_guest_name);
  await put(q, p.id, bookingPath(booking.id), body);
}

export async function enqueuePayment(q: Queryable, propertyId: string, payment: Payment): Promise<void> {
  const p = await one<{ aynes_key_enc: string | null }>(q, 'select aynes_key_enc from properties where id = $1', [propertyId]);
  if (!p?.aynes_key_enc) return;
  await put(q, propertyId, paymentPath(payment.bookingId, payment.id), toAynesPayment(payment));
}

/** Retry delays: 1 min, 5 min, 30 min, 2 h, then every 6 h (Aynes may be down, hosts offline). */
const BACKOFF_MIN = [1, 5, 30, 120, 360];

export interface SendOutcome {
  sent: number;
  failed: number;
  retried: number;
}

/** Sends due requests. Safe to run from several processes (SKIP LOCKED). */
export async function flushOutbox(ctx: Ctx, propertyId?: string, limit = 25): Promise<SendOutcome> {
  const outcome: SendOutcome = { sent: 0, failed: 0, retried: 0 };
  await tx(ctx.db, async (c) => {
    const rows = await many<OutboxRow & { aynes_key_enc: string | null }>(
      c,
      `select o.*, p.aynes_key_enc from outbox o join properties p on p.id = o.property_id
        where o.status = 'pending' and o.next_attempt_at <= $1 ${propertyId ? 'and o.property_id = $3' : ''}
        order by o.id limit $2 for update of o skip locked`,
      propertyId ? [ctx.now().toISOString(), limit, propertyId] : [ctx.now().toISOString(), limit],
    );
    for (const row of rows) {
      if (!row.aynes_key_enc) {
        await c.query(`update outbox set status = 'failed', last_error = 'aynes_not_connected' where id = $1`, [row.id]);
        outcome.failed++;
        continue;
      }
      let status = 0;
      let error = '';
      try {
        const res = await ctx.fetch(new URL(row.path, ctx.config.AYNES_API_URL), {
          method: 'PUT',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${decrypt(row.aynes_key_enc, ctx.config.SERVER_SECRET)}` },
          body: JSON.stringify(row.body),
          signal: AbortSignal.timeout(15_000),
        });
        status = res.status;
        if (!res.ok) error = `${res.status} ${(await res.text()).slice(0, 300)}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (status >= 200 && status < 300) {
        await c.query(`update outbox set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null where id = $1`, [row.id]);
        outcome.sent++;
      } else if (status === 0 || status === 429 || status >= 500) {
        // Network or Aynes trouble: try again later.
        const wait = BACKOFF_MIN[Math.min(row.attempts, BACKOFF_MIN.length - 1)]!;
        await c.query(
          `update outbox set attempts = attempts + 1, last_error = $2, next_attempt_at = $3 where id = $1`,
          [row.id, error, new Date(ctx.now().getTime() + wait * 60_000).toISOString()],
        );
        outcome.retried++;
      } else {
        // 401/403/409/422: retrying the same request will not help — show it to the owner.
        await c.query(`update outbox set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1`, [row.id, error]);
        outcome.failed++;
      }
    }
  });
  return outcome;
}

/** After connecting Aynes: queue every booking and payment of the property once. */
export async function backfill(q: Queryable, propertyId: string): Promise<void> {
  const bookings = await many<BookingRow>(q, 'select * from bookings where property_id = $1', [propertyId]);
  for (const b of bookings) await enqueueBooking(q, toBooking(b));
  const payments = await many<PaymentRow>(
    q,
    'select pay.* from payments pay join bookings b on b.id = pay.booking_id where b.property_id = $1',
    [propertyId],
  );
  for (const p of payments) await enqueuePayment(q, propertyId, toPayment(p));
}
