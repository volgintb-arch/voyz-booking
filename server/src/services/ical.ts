// iCal: export our occupancy to Booking.com / Airbnb and import theirs (TZ §4, host 5).

import { addDays, isIsoDate, rangesOverlap } from '../../../src/domain/dates';
import type { Ctx } from '../context';
import { newId } from '../crypto';
import { many, one, tx } from '../db';
import type { BlockRow, BookingRow, IcalRow } from '../model';

export interface IcsEvent {
  uid: string;
  start: string; // first night, YYYY-MM-DD
  end: string; // check-out day
  summary: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

/** DTSTART;VALUE=DATE:20270714 or DTSTART:20270714T140000Z → 2027-07-14 */
function icsDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isIsoDate(iso) ? iso : null;
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur?.start) {
        const end = cur.end && cur.end > cur.start ? cur.end : addDays(cur.start, 1);
        events.push({ uid: cur.uid ?? `${cur.start}-${end}`, start: cur.start, end, summary: cur.summary ?? '' });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const name = line.slice(0, idx).split(';')[0]!.toUpperCase();
      const value = line.slice(idx + 1);
      if (name === 'DTSTART') cur.start = icsDate(value) ?? undefined;
      else if (name === 'DTEND') cur.end = icsDate(value) ?? undefined;
      else if (name === 'UID') cur.uid = value.trim();
      else if (name === 'SUMMARY') cur.summary = value.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
    }
  }
  return events;
}

const icsDay = (iso: string) => iso.replace(/-/g, '');

/** Feed for one unit: every night it is taken, without guest names (privacy). */
export function exportIcs(unitId: string, unitName: string, ranges: { id: string; from: string; to: string }[], stamp: Date): string {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Voyz//Booking//RU', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Voyz ${unitName}`];
  for (const r of ranges) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@voyz-${unitId}`,
      `DTSTAMP:${dt}`,
      `DTSTART;VALUE=DATE:${icsDay(r.from)}`,
      `DTEND;VALUE=DATE:${icsDay(r.to)}`,
      'SUMMARY:Voyz — занято',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export async function unitFeed(ctx: Ctx, icalToken: string): Promise<string | null> {
  const unit = await one<{ id: string; name: string }>(ctx.db, 'select id, name from units where ical_token = $1', [icalToken]);
  if (!unit) return null;
  const since = addDays(new Date().toISOString().slice(0, 10), -30);
  const bookings = await many<BookingRow>(
    ctx.db,
    `select * from bookings where unit_id = $1 and check_out > $2 and status in ('pending','confirmed','checked_in','checked_out')`,
    [unit.id, since],
  );
  // Manual closures and other OTAs' bookings too, so Booking.com sees Airbnb's nights and vice versa.
  const blocks = await many<BlockRow>(ctx.db, 'select * from blocks where unit_id = $1 and date_to > $2', [unit.id, since]);
  return exportIcs(
    unit.id,
    unit.name,
    [...bookings.map((b) => ({ id: b.id, from: b.check_in, to: b.check_out })), ...blocks.map((b) => ({ id: b.id, from: b.date_from, to: b.date_to }))],
    ctx.now(),
  );
}

export interface SyncResult {
  imported: number;
  conflicts: string[];
  error: string | null;
}

/** Replaces the channel's blocks with what the OTA calendar says now. */
export async function syncChannel(ctx: Ctx, channelId: string): Promise<SyncResult> {
  const ch = await one<IcalRow & { property_id: string; owner_id: string; unit_name: string }>(
    ctx.db,
    `select c.*, u.property_id, u.name as unit_name, p.owner_id from ical_channels c
       join units u on u.id = c.unit_id join properties p on p.id = u.property_id where c.id = $1`,
    [channelId],
  );
  if (!ch) return { imported: 0, conflicts: [], error: 'not_found' };
  let events: IcsEvent[];
  try {
    const res = await ctx.fetch(ch.import_url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'VoyzBooking/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    events = parseIcs(await res.text());
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await ctx.db.query('update ical_channels set last_error = $2 where id = $1', [channelId, error]);
    return { imported: 0, conflicts: [], error };
  }
  const today = new Date(ctx.now().getTime()).toISOString().slice(0, 10);
  const future = events.filter((e) => e.end > today && !e.uid.includes('@voyz-'));
  const label = ch.platform === 'booking_com' ? 'Booking.com' : ch.platform === 'airbnb' ? 'Airbnb' : 'iCal';

  const { conflicts, gone } = await tx(ctx.db, async (c) => {
    // Bookings the host already made from this channel's events (with sum and commission).
    const linked = await many<BookingRow>(
      c,
      `select * from bookings where ical_channel_id = $1 and status not in ('cancelled', 'no_show')`,
      [channelId],
    );
    const isBooked = (e: IcsEvent) => linked.some((b) => b.ical_uid === e.uid && b.check_in === e.start && b.check_out === e.end);
    await c.query('delete from blocks where ical_channel_id = $1', [channelId]);
    for (const e of future) {
      if (isBooked(e)) continue;
      await c.query(
        `insert into blocks (id, unit_id, date_from, date_to, reason, label, ical_channel_id, ical_uid) values ($1,$2,$3,$4,'ical',$5,$6,$7)`,
        [newId('bl'), ch.unit_id, e.start, e.end, label, channelId, e.uid],
      );
    }
    await c.query('update ical_channels set last_sync_at = $2, last_error = null where id = $1', [channelId, ctx.now().toISOString()]);
    const ours = await many<BookingRow>(
      c,
      `select * from bookings where unit_id = $1 and check_out > $2 and status in ('pending','confirmed','checked_in')`,
      [ch.unit_id, today],
    );
    const overlapping = ours
      .filter((b) => future.some((e) => !(b.ical_channel_id === channelId && b.ical_uid === e.uid) && rangesOverlap(e.start, e.end, b.check_in, b.check_out)))
      .map((b) => `${ch.unit_name}: ${b.id} ${b.guest_name} ${b.check_in} — ${b.check_out} ↔ ${label}`);
    // The OTA calendar no longer has the event: most likely the guest cancelled there.
    const missing: string[] = [];
    for (const b of linked) {
      if (b.check_out <= today || b.status === 'checked_in' || events.some((e) => e.uid === b.ical_uid)) continue;
      const fresh = await c.query('insert into notification_log(key) values ($1) on conflict do nothing', [`ical-gone:${b.id}`]);
      if (fresh.rowCount) missing.push(`${ch.unit_name}: ${b.id} ${b.guest_name} ${b.check_in} — ${b.check_out} · ${label}`);
    }
    return { conflicts: overlapping, gone: missing };
  });
  if (conflicts.length) await ctx.notify.icalConflict(ch.owner_id, conflicts.join('\n'));
  if (gone.length) await ctx.notify.icalGone(ch.owner_id, gone.join('\n'));
  return { imported: future.length, conflicts, error: null };
}

/** Channels not refreshed for `minutes` (Booking.com itself refreshes only a few times a day). */
export async function syncDue(ctx: Ctx, minutes = 20): Promise<number> {
  const due = await many<{ id: string }>(
    ctx.db,
    `select id from ical_channels where last_sync_at is null or last_sync_at < $1 order by last_sync_at nulls first limit 20`,
    [new Date(ctx.now().getTime() - minutes * 60_000).toISOString()],
  );
  for (const d of due) await syncChannel(ctx, d.id);
  return due.length;
}
