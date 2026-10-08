import { afterEach, describe, expect, it } from 'vitest';
import { api, bearer, devToken, harness, type Harness } from './helpers';
import { createHmac } from 'node:crypto';
import { verifyWebAppInitData } from '../src/services/auth';
import { upsertTelegramHost, webhookId } from '../src/services/telegram';
import { removeDemo } from '../src/demo';
import { expireHolds, remindHolds } from '../src/services/bookings';
import { flushOutbox } from '../src/services/outbox';
import { parseIcs } from '../src/services/ical';

let h: Harness;
afterEach(async () => h?.close());

const stay = { checkIn: '2027-07-14', checkOut: '2027-07-17', guests: 2 };
const guest = { guestName: 'Айгерим', guestPhone: '+996 555 123 456', consent: true };

type BookingResp = { booking: { id: string; status: string; holdUntil: string | null; unitId: string; total: number; prepaymentDue: number }; guestToken: string };
type State = { properties: { id: string; slug: string }[]; bookings: { id: string; status: string }[]; payments: { bookingId: string; kind: string; amount: number }[]; units: { id: string; icalExportUrl: string }[]; outbox: { status: string; path: string }[] };

describe('guest booking', () => {
  it('books from the catalog, holds the unit and serves the guest view by token only', async () => {
    h = await harness();
    const cat = await api<{ properties: unknown[]; occupancy: unknown[] }>(h, 'GET', '/api/public/catalog');
    expect(cat.data.properties).toHaveLength(4);

    const r = await api<BookingResp>(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', {
      categoryId: 'c-sk-std', ...stay, ...guest, source: 'instagram',
    });
    expect(r.status).toBe(201);
    expect(r.data.booking.status).toBe('pending');
    // High season 4 500 × 3 nights, 30 % deposit, Son-Kul holds 24 h
    expect(r.data.booking.total).toBe(1350000);
    expect(r.data.booking.prepaymentDue).toBe(405000);
    expect(r.data.booking.holdUntil).toBe('2027-06-02T06:00:00.000Z');
    expect(h.events).toContainEqual({ kind: 'created', ownerId: 'host-1', id: r.data.booking.id });

    const id = r.data.booking.id;
    const view = await api<{ booking: { guestPhone: string }; payment: { recipient: string } }>(h, 'GET', `/api/public/bookings/${id}`, undefined, {
      'x-guest-token': r.data.guestToken,
    });
    expect(view.data.payment.recipient).toBe('Бакыт Т.');
    expect(view.data.booking.guestPhone).toBe('');
    expect((await api(h, 'GET', `/api/public/bookings/${id}`, undefined, { 'x-guest-token': 'wrong' })).status).toBe(404);

    await api(h, 'POST', `/api/public/bookings/${id}/report-paid`, {}, { 'x-guest-token': r.data.guestToken });
    expect(h.events.map((e) => e.kind)).toContain('paid');
  });

  it('never sells one unit twice, even under parallel requests', async () => {
    h = await harness();
    // Bosteri has 4 domes; 6 guests try the same nights at once.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        api(h, 'POST', '/api/public/properties/bosteri-glamp/bookings', { categoryId: 'c-bb-dome', ...stay, ...guest }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(4);
    expect(results.filter((r) => r.error?.code === 'dates_taken')).toHaveLength(2);
  });

  it('rejects stays that break the rules', async () => {
    h = await harness();
    const short = await api(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', {
      categoryId: 'c-sk-std', checkIn: '2027-07-14', checkOut: '2027-07-15', guests: 2, ...guest,
    });
    expect(short.status).toBe(422); // high season needs 2 nights
    const noConsent = await api(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', ...stay, ...guest, consent: false });
    expect(noConsent.status).toBe(422);
  });

  it('releases an unpaid booking after the hold and notifies the host', async () => {
    h = await harness();
    const r = await api<BookingResp>(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', ...stay, ...guest });
    h.clock.now = new Date('2027-06-02T06:00:01Z');
    const expired = await expireHolds(h.ctx);
    expect(expired.map((b) => b.id)).toContain(r.data.booking.id);
    expect(expired.find((b) => b.id === r.data.booking.id)?.cancelReason).toBe('hold_expired');
    expect(h.events.map((e) => e.kind)).toContain('expired');
  });
});

describe('host', () => {
  it('signs in through the Telegram bot and creates a property', async () => {
    h = await harness();
    const start = await api<{ code: string; botUrl: string }>(h, 'POST', '/api/auth/telegram/start');
    expect(start.data.botUrl).toBe(`https://t.me/voyz_test_bot?start=login_${start.data.code}`);
    expect((await api<{ status: string }>(h, 'GET', `/api/auth/telegram/poll?code=${start.data.code}`)).data.status).toBe('waiting');

    const hook = await h.app.inject({
      method: 'POST',
      url: `/api/telegram/webhook/${webhookId('hook')}`,
      payload: { message: { chat: { id: 777 }, from: { id: 777, first_name: 'Нурлан', language_code: 'ru' }, text: `/start login_${start.data.code}` } },
    });
    expect(hook.statusCode).toBe(200);
    expect(h.calls.some((c) => c.url.includes('sendMessage'))).toBe(true);

    const poll = await api<{ status: string; token: string }>(h, 'GET', `/api/auth/telegram/poll?code=${start.data.code}`);
    expect(poll.data.status).toBe('ok');
    // The code works only once.
    expect((await api(h, 'GET', `/api/auth/telegram/poll?code=${start.data.code}`)).data).toEqual({ status: 'waiting' });

    const auth = bearer(poll.data.token);
    const created = await api<State>(h, 'POST', '/api/host/properties', {
      kind: 'yurt_camp', name: 'Кел-Суу Лагерь', region: 'Кел-Суу, Нарын',
      categories: [{ name: 'Юрта', capacity: 4, baseOccupancy: 2, basePrice: 300000, units: ['Юрта 1', 'Юрта 2'] }],
    }, auth);
    expect(created.status).toBe(200);
    expect(created.data.properties.map((p) => p.slug)).toEqual(['kel-suu-lager']);
    expect(created.data.units[0]!.icalExportUrl).toMatch(/^https:\/\/api\.test\/ical\/.+\.ics$/);
    expect((await api(h, 'GET', '/api/host/state')).status).toBe(401);
  });

  it('edits the property, room types and units, but never deletes booked ones', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    type S = Omit<State, 'units' | 'properties'> & { categories: { id: string; name: { ru: string } }[]; units: { id: string; name: string; categoryId: string }[]; properties: { id: string; amenities: string[]; name: { ru: string } }[] };
    let s = await api<S>(h, 'PATCH', '/api/host/properties/p-sonkul', { amenities: ['wifi', 'sauna'], name: { ru: 'Сон-Куль', ky: 'Соң-Көл', en: 'Son-Kul' } }, auth);
    expect(s.data.properties.find((p) => p.id === 'p-sonkul')).toMatchObject({ amenities: ['wifi', 'sauna'], name: { ru: 'Сон-Куль' } });

    s = await api<S>(h, 'POST', '/api/host/properties/p-sonkul/categories', { name: 'VIP-юрта', capacity: 2, baseOccupancy: 2, basePrice: 900000, units: ['VIP 1'] }, auth);
    const vip = s.data.categories.find((c) => c.name.ru === 'VIP-юрта')!;
    s = await api<S>(h, 'POST', `/api/host/categories/${vip.id}/units`, { name: 'VIP 2' }, auth);
    const vipUnits = s.data.units.filter((u) => u.categoryId === vip.id);
    expect(vipUnits.map((u) => u.name)).toEqual(['VIP 1', 'VIP 2']);
    s = await api<S>(h, 'PATCH', `/api/host/units/${vipUnits[1]!.id}`, { name: 'VIP Озеро' }, auth);
    expect(s.data.units.some((u) => u.name === 'VIP Озеро')).toBe(true);

    // Units and room types with bookings stay.
    expect((await api(h, 'DELETE', '/api/host/units/u-sk-1', undefined, auth)).error?.code).toBe('conflict');
    expect((await api(h, 'DELETE', '/api/host/categories/c-sk-std', undefined, auth)).error?.code).toBe('conflict');
    s = await api<S>(h, 'DELETE', `/api/host/categories/${vip.id}`, undefined, auth);
    expect(s.data.units.some((u) => u.categoryId === vip.id)).toBe(false);
  });

  it('removes the demo properties but never a real host', async () => {
    h = await harness();
    const real = await upsertTelegramHost(h.db, { id: 777, first_name: 'Айбек' });
    await h.db.query(`update properties set owner_id = $1 where id = 'p-sonkul'`, [real.id]);
    expect(await removeDemo(h.db)).toBe(3);
    const left = await h.db.query<{ id: string }>('select id from properties');
    expect(left.rows.map((r) => r.id)).toEqual(['p-sonkul']);
    expect((await h.db.query(`select 1 from hosts where id in ('host-1', 'host-2')`)).rowCount).toBe(0);
    expect(await removeDemo(h.db)).toBe(0);
  });

  it('keeps dev login off unless explicitly allowed', async () => {
    h = await harness();
    expect((await api(h, 'POST', '/api/auth/dev')).status).toBe(403);
  });

  it('confirms with "Money received", enforces status rules and ownership', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    const g = await api<BookingResp>(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', ...stay, ...guest });
    const id = g.data.booking.id;

    const s = await api<State>(h, 'POST', `/api/host/bookings/${id}/deposit-received`, { method: 'qr' }, auth);
    expect(s.data.bookings.find((b) => b.id === id)?.status).toBe('confirmed');
    expect(s.data.payments.filter((p) => p.bookingId === id)).toEqual([expect.objectContaining({ kind: 'prepayment', amount: 405000 })]);

    const bad = await api(h, 'POST', `/api/host/bookings/${id}/status`, { status: 'checked_out' }, auth);
    expect(bad.error?.code).toBe('conflict');

    const manual = await api(h, 'POST', '/api/host/properties/p-sonkul/bookings', {
      unitId: g.data.booking.unitId, checkIn: '2027-07-15', checkOut: '2027-07-16', guests: 1, guestName: 'Из WhatsApp',
    }, auth);
    expect(manual.error?.code).toBe('dates_taken');

    // Another host sees nothing of host-1.
    await h.db.query(`insert into sessions (token_hash, host_id, expires_at) values (encode(sha256('other'::bytea), 'hex'), 'host-2', '2030-01-01')`);
    const foreign = await api(h, 'POST', `/api/host/bookings/${id}/status`, { status: 'cancelled' }, bearer('other'));
    expect(foreign.status).toBe(404);
  });

  it('confirms from the Telegram button', async () => {
    h = await harness();
    await h.db.query(`update hosts set telegram_id = 555 where id = 'host-1'`);
    const g = await api<BookingResp>(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', ...stay, ...guest });
    await h.app.inject({
      method: 'POST',
      url: `/api/telegram/webhook/${webhookId('hook')}`,
      payload: { callback_query: { id: 'cb1', from: { id: 555, first_name: 'Б' }, data: `c:${g.data.booking.id}`, message: { chat: { id: 555 }, message_id: 1, text: 'Новая бронь' } } },
    });
    const row = await h.db.query('select status from bookings where id = $1', [g.data.booking.id]);
    expect(row.rows[0].status).toBe('confirmed');
    // A stranger pressing the button changes nothing.
    expect((await h.app.inject({ method: 'POST', url: '/api/telegram/webhook/wrong', payload: {} })).statusCode).toBe(404);
  });
});

describe('Aynes outbox', () => {
  it('connects the key, backfills, sends with the key and never sends phones', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    const s = await api<State>(h, 'PUT', '/api/host/properties/p-sonkul/aynes', { key: 'fsk_live_abcdef123456' }, auth);
    expect(s.status).toBe(200);
    const sent = h.calls.filter((c) => c.url.startsWith('https://aynes.test/api/v1/bookings/voyz/'));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((c) => c.headers.authorization === 'Bearer fsk_live_abcdef123456' && c.method === 'PUT')).toBe(true);
    expect(JSON.stringify(sent.map((c) => c.body))).not.toContain('+996');
    expect(s.data.outbox.every((o) => o.status === 'sent')).toBe(true);
    // The key itself is stored encrypted.
    const row = await h.db.query(`select aynes_key_enc from properties where id = 'p-sonkul'`);
    expect(row.rows[0].aynes_key_enc).not.toContain('fsk_');
  });

  it('retries when Aynes is down and gives up on a 409', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    h.respond.set('aynes.test', () => new Response('down', { status: 503 }));
    await api(h, 'PUT', '/api/host/properties/p-sonkul/aynes', { key: 'fsk_live_abcdef123456' }, auth);
    const pending = await h.db.query(`select count(*)::int as n from outbox where status = 'pending' and attempts = 1`);
    expect(pending.rows[0].n).toBeGreaterThan(0);

    h.respond.set('aynes.test', () => new Response('{"ok":false}', { status: 409 }));
    h.clock.now = new Date(h.clock.now.getTime() + 2 * 60_000);
    await flushOutbox(h.ctx);
    const failed = await h.db.query(`select count(*)::int as n from outbox where status = 'failed'`);
    expect(failed.rows[0].n).toBeGreaterThan(0);
  });

  it('treats "Aynes already has a newer version" as delivered', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    h.respond.set('aynes.test', () => Response.json({ ok: false, error: { code: 'conflict', details: { currentVersion: 99 } } }, { status: 409 }));
    await api(h, 'PUT', '/api/host/properties/p-sonkul/aynes', { key: 'fsk_live_abcdef123456' }, auth);
    const left = await h.db.query(`select count(*)::int as n from outbox where status <> 'sent' and path not like '%/payments/%'`);
    expect(left.rows[0].n).toBe(0);
  });
});

describe('iCal and share links', () => {
  it('exports occupancy and imports OTA bookings as blocks', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    const state = await api<State>(h, 'GET', '/api/host/state', undefined, auth);
    const u1 = state.data.units.find((u) => u.id === 'u-sk-1')!;
    const feed = await h.app.inject({ method: 'GET', url: new URL(u1.icalExportUrl).pathname });
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.body).toContain('BEGIN:VEVENT');
    expect(feed.body).not.toContain('Айгерим');

    h.respond.set('ical.example', () =>
      new Response(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:bk1', 'DTSTART;VALUE=DATE:20270801', 'DTEND;VALUE=DATE:20270804', 'SUMMARY:CLOSED - Not available', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')),
    );
    const added = await api<State & { icalChannels: { id: string }[] }>(h, 'POST', '/api/host/units/u-sk-5/ical-channels', { platform: 'booking_com', importUrl: 'https://ical.example/feed.ics' }, auth);
    const ch = added.data.icalChannels.find((c) => c)!;
    const synced = await api<State & { blocks: { unitId: string; from: string; reason: string }[]; result: { imported: number } }>(h, 'POST', `/api/host/ical-channels/${ch.id}/sync`, {}, auth);
    expect(synced.data.result.imported).toBe(1);
    expect(synced.data.blocks).toContainEqual(expect.objectContaining({ unitId: 'u-sk-5', from: '2027-08-01', reason: 'ical' }));

    // Guests can no longer book that unit on those nights: only 4 standard yurts left.
    const tries = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', checkIn: '2027-08-01', checkOut: '2027-08-03', guests: 2, ...guest }),
      ),
    );
    const booked = await h.db.query(`select unit_id from bookings where check_in = '2027-08-01'`);
    expect(booked.rows.map((r) => r.unit_id)).not.toContain('u-sk-5');
    expect(tries.filter((t) => t.status === 201)).toHaveLength(booked.rowCount!);
  });

  it('turns an OTA stripe into a booking with sum and commission for Aynes, and keeps it across syncs', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    const ics = (events: string[][]) => () =>
      new Response(['BEGIN:VCALENDAR', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n'));
    const event = ['UID:air-77', 'DTSTART;VALUE=DATE:20270801', 'DTEND;VALUE=DATE:20270804', 'SUMMARY:Reserved'];
    h.respond.set('ical.example', ics([event]));
    await api(h, 'PUT', '/api/host/properties/p-sonkul/aynes', { key: 'fsk_live_abcdef123456' }, auth);
    type S = State & { icalChannels: { id: string }[]; blocks: { id: string; unitId: string; from: string; label: string }[]; result: { id: string } | null };
    const ours = (b: { unitId: string; from: string }) => b.unitId === 'u-sk-5' && b.from === '2027-08-01';
    const added = await api<S>(h, 'POST', '/api/host/units/u-sk-5/ical-channels', { platform: 'airbnb', importUrl: 'https://ical.example/air.ics' }, auth);
    const ch = added.data.icalChannels[0]!;
    const synced = await api<S>(h, 'POST', `/api/host/ical-channels/${ch.id}/sync`, {}, auth);
    const stripe = synced.data.blocks.find(ours)!;
    expect(stripe.label).toBe('Airbnb');

    const tooMuch = await api(h, 'POST', `/api/host/blocks/${stripe.id}/booking`, { guestName: 'John', guests: 2, channel: 'airbnb', total: 100, commission: 200 }, auth);
    expect(tooMuch.status).toBe(422);
    const made = await api<S>(h, 'POST', `/api/host/blocks/${stripe.id}/booking`, {
      guestName: 'John Smith', guests: 2, channel: 'airbnb', total: 1_350_000, commission: 202_500,
    }, auth);
    expect(made.status).toBe(200);
    const id = made.data.result!.id;
    expect(made.data.bookings.find((b) => b.id === id)).toMatchObject({ status: 'confirmed', channelCommission: 202_500 });
    expect(made.data.blocks.some((b) => b.id === stripe.id)).toBe(false);
    await flushOutbox(h.ctx);
    const sent = h.calls.find((c) => c.method === 'PUT' && c.url.includes(`/bookings/voyz/${id}`));
    expect(sent?.body).toMatchObject({ channel: 'airbnb', total: 1_350_000, channelCommission: 202_500, checkIn: '2027-08-01', checkOut: '2027-08-04' });

    // Airbnb pays out the total minus its fee.
    await api(h, 'POST', `/api/host/bookings/${id}/payments`, { kind: 'payment', method: 'ota', amount: 1_350_000, fee: 202_500, provider: 'airbnb' }, auth);
    await flushOutbox(h.ctx);
    const payout = h.calls.find((c) => c.method === 'PUT' && c.url.includes(`/bookings/voyz/${id}/payments/`));
    expect(payout?.body).toMatchObject({ method: 'ota', amount: 1_350_000, fee: 202_500, provider: 'airbnb' });

    // Next sync: the same event is the booking now — no stripe, no double-booking alarm.
    const again = await api<S>(h, 'POST', `/api/host/ical-channels/${ch.id}/sync`, {}, auth);
    expect(again.data.blocks.some(ours)).toBe(false);
    expect(h.events.filter((e) => e.kind === 'ical')).toHaveLength(0);

    // The guest cancelled on Airbnb: the event is gone, the host hears it once.
    h.respond.set('ical.example', ics([]));
    await api(h, 'POST', `/api/host/ical-channels/${ch.id}/sync`, {}, auth);
    await api(h, 'POST', `/api/host/ical-channels/${ch.id}/sync`, {}, auth);
    expect(h.events.filter((e) => e.kind === 'ical-gone')).toHaveLength(1);
  });

  it('parses folded lines and date-time values', () => {
    const ev = parseIcs('BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20270801T140000Z\r\nDTEND:20270803T100000Z\r\nSUMMARY:Re\r\n served\r\nEND:VEVENT');
    expect(ev).toEqual([{ uid: 'a', start: '2027-08-01', end: '2027-08-03', summary: 'Reserved' }]);
  });

  it('serves a preview page for any property and forwards the link source', async () => {
    h = await harness();
    const res = await h.app.inject({ method: 'GET', url: '/s/karakol-house?src=instagram&in=2027-07-01' });
    expect(res.body).toContain('og:title" content="Гостевой дом «Каракол Хаус»"');
    expect(res.body).toContain('https://app.test/#/guest/p/karakol-house?src=instagram&amp;in=2027-07-01');
  });
});

describe('telegram webhook', () => {
  it('re-claims the webhook when another service took the bot', async () => {
    h = await harness();
    h.respond.set('getMe', () => Response.json({ ok: true, result: { username: 'voyz_test_bot' } }));
    h.respond.set('getWebhookInfo', () => Response.json({ ok: true, result: { url: 'https://other.example/hook', pending_update_count: 3 } }));
    const r = await api<{ webhookOk: boolean; fixed: boolean; botUsername: string }>(h, 'GET', '/api/telegram/status');
    expect(r.data).toMatchObject({ webhookOk: true, fixed: true, botUsername: 'voyz_test_bot' });
    const set = h.calls.find((c) => c.url.endsWith('/setWebhook'));
    expect(set?.body).toMatchObject({ url: `https://api.test/api/telegram/webhook/${webhookId('hook')}`, secret_token: webhookId('hook') });
    expect(JSON.stringify(r.data)).not.toContain(webhookId('hook'));
  });
});

function fakePng(width: number, height: number): string {
  const b = Buffer.alloc(64);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return `data:image/png;base64,${b.toString('base64')}`;
}

describe('photos', () => {
  it('reads image sizes from JPEG, PNG and WebP headers', async () => {
    const { imageSize } = await import('../src/services/photos');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0]);
    expect(imageSize(jpeg, 'image/jpeg')).toEqual({ width: 800, height: 600 });
    expect(imageSize(Buffer.from(fakePng(1600, 900).split(',')[1]!, 'base64'), 'image/png')).toEqual({ width: 1600, height: 900 });
    expect(imageSize(Buffer.from('hello world, not an image at all'), 'image/jpeg')).toBeNull();
  });

  it('uploads, orders, serves and deletes photos; the cover becomes the link preview', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' });
    const auth = bearer(await devToken(h));
    type S = { photos: { id: string; url: string; propertyId: string }[] };
    await api<S>(h, 'POST', '/api/host/properties/p-sonkul/photos', { data: fakePng(1600, 1200) }, auth);
    const s = await api<S>(h, 'POST', '/api/host/properties/p-sonkul/photos', { data: fakePng(1200, 900) }, auth);
    expect(s.data.photos).toHaveLength(2);
    const [first, second] = s.data.photos as [S['photos'][0], S['photos'][0]];
    expect(first.url).toMatch(/^https:\/\/api\.test\/photos\/ph_.+\.png$/);

    const img = await h.app.inject({ method: 'GET', url: new URL(first.url).pathname });
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');

    const re = await api<S>(h, 'POST', '/api/host/properties/p-sonkul/photos/order', { ids: [second.id, first.id] }, auth);
    expect(re.data.photos.map((p) => p.id)).toEqual([second.id, first.id]);
    const cat = await api<S>(h, 'GET', '/api/public/catalog');
    expect(cat.data.photos[0]!.id).toBe(second.id);
    const share = await h.app.inject({ method: 'GET', url: '/s/son-kul-aiyl' });
    expect(share.body).toContain(`og:image" content="${second.url}"`);

    expect((await api(h, 'POST', '/api/host/properties/p-sonkul/photos', { data: fakePng(50, 50) }, auth)).status).toBe(422);
    expect((await api(h, 'POST', '/api/host/properties/p-sonkul/photos', { data: 'data:text/html;base64,PGgxPg==' }, auth)).status).toBe(422);

    await h.db.query(`insert into sessions (token_hash, host_id, expires_at) values (encode(sha256('other'::bytea), 'hex'), 'host-2', '2030-01-01')`);
    expect((await api(h, 'DELETE', `/api/host/photos/${first.id}`, undefined, bearer('other'))).status).toBe(404);
    const del = await api<S>(h, 'DELETE', `/api/host/photos/${first.id}`, undefined, auth);
    expect(del.data.photos.map((p) => p.id)).toEqual([second.id]);
  });
});

describe('database lock-down', () => {
  it('turns on row level security for every table (our server owns them and still works)', async () => {
    h = await harness();
    const r = await h.db.query(`select count(*)::int as n from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(r.rows[0].n).toBe(0);
  });
});

describe('database connection', () => {
  it('encrypts Supabase connections and leaves local ones alone', async () => {
    const { poolConfig } = await import('../src/db');
    const sb = poolConfig('postgresql://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require');
    expect(sb.ssl).toEqual({ rejectUnauthorized: false });
    expect(sb.connectionString).not.toContain('sslmode');
    expect(poolConfig('postgres://voyz:voyz@localhost:5432/voyz').ssl).toBeUndefined();
    expect(poolConfig('postgres://u:p@db.example.kg:5432/voyz', 'verify').ssl).toBe(true);
  });
});

describe('config', () => {
  it('keeps the webhook path URL-safe whatever the generated secret is', () => {
    expect(webhookId('a/b+c==')).toMatch(/^[0-9a-f]{48}$/);
  });

  it('accepts the bot name with or without @', async () => {
    const { loadConfig } = await import('../src/config');
    const base = { DATABASE_URL: 'x', SERVER_SECRET: 'x'.repeat(32) };
    expect(loadConfig({ ...base, TELEGRAM_BOT_USERNAME: '@voyz_bot' }).TELEGRAM_BOT_USERNAME).toBe('voyz_bot');
    expect(loadConfig({ ...base, TELEGRAM_BOT_USERNAME: 'https://t.me/voyz_bot' }).TELEGRAM_BOT_USERNAME).toBe('voyz_bot');
    expect(loadConfig({ ...base, RENDER_EXTERNAL_URL: 'https://x.onrender.com' }).API_URL).toBe('https://x.onrender.com/');
  });
});

describe('Telegram Mini App sign-in', () => {
  it('accepts initData signed with the bot token and rejects tampering', () => {
    const token = '123:ABC';
    const user = JSON.stringify({ id: 42, first_name: 'Айбек' });
    const params = new URLSearchParams({ auth_date: '1800000000', user });
    const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
    expect(verifyWebAppInitData(params.toString(), token, 3600, 1800000100)).toMatchObject({ id: 42 });
    params.set('user', JSON.stringify({ id: 43, first_name: 'X' }));
    expect(verifyWebAppInitData(params.toString(), token, 3600, 1800000100)).toBeNull();
  });
});

describe('guest follows the booking in Telegram', () => {
  const start = (h: Harness, text: string, chat = 4242) =>
    h.app.inject({
      method: 'POST',
      url: `/api/telegram/webhook/${webhookId('hook')}`,
      payload: { message: { chat: { id: chat }, from: { id: chat, first_name: 'Guest', language_code: 'en' }, text } },
    });
  const sent = (h: Harness, chat: number) =>
    h.calls.filter((c) => c.url.endsWith('/sendMessage') && (c.body as { chat_id: number }).chat_id === chat) as {
      body: { text: string; reply_markup?: { inline_keyboard: { url?: string }[][] } };
    }[];

  it('links by a one-time code and hears about confirmation, never becoming a host', async () => {
    h = await harness({ ALLOW_DEV_LOGIN: 'true' }, { realNotifier: true });
    const r = await api<BookingResp>(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', ...stay, ...guest, source: 'direct' });
    const id = r.data.booking.id;
    const token = { 'x-guest-token': r.data.guestToken };
    expect((await api(h, 'POST', `/api/public/bookings/${id}/telegram`, { lang: 'en' }, { 'x-guest-token': 'nope' })).status).toBe(404);
    const link = await api<{ url: string; linked: boolean }>(h, 'POST', `/api/public/bookings/${id}/telegram`, { lang: 'en' }, token);
    expect(link.data).toMatchObject({ linked: false });
    expect(link.data.url).toMatch(/^https:\/\/t\.me\/voyz_test_bot\?start=g_[A-Za-z0-9_-]+$/);
    expect((await api<{ url: string }>(h, 'POST', `/api/public/bookings/${id}/telegram`, { lang: 'en' }, token)).data.url).toBe(link.data.url);

    const hosts = (await h.db.query('select count(*)::int as n from hosts')).rows[0].n;
    await start(h, `/start ${link.data.url.split('start=')[1]}`);
    const hello = sent(h, 4242).at(-1)!;
    expect(hello.body.text).toContain('Done!');
    expect(hello.body.text).toContain('Deposit');
    expect(hello.body.reply_markup?.inline_keyboard[0]![0]!.url).toBe(`https://app.test/#/guest/open/${id}?t=${encodeURIComponent(r.data.guestToken)}`);
    expect((await h.db.query('select count(*)::int as n from hosts')).rows[0].n).toBe(hosts);
    expect((await api<{ telegram: { linked: boolean } }>(h, 'GET', `/api/public/bookings/${id}`, undefined, token)).data.telegram).toEqual({ available: true, linked: true });

    // The code works once.
    await start(h, `/start ${link.data.url.split('start=')[1]}`, 5151);
    expect(sent(h, 5151).at(-1)!.body.text).toContain('expired');

    const auth = bearer(await devToken(h));
    await api(h, 'POST', `/api/host/bookings/${id}/deposit-received`, { method: 'qr' }, auth);
    expect(sent(h, 4242).at(-1)!.body.text).toContain('The host confirmed your booking');
  });

  it('reminds once when less than an hour is left to pay', async () => {
    h = await harness({}, { realNotifier: true });
    const r = await api<BookingResp>(h, 'POST', '/api/public/properties/son-kul-aiyl/bookings', { categoryId: 'c-sk-std', ...stay, ...guest, source: 'direct' });
    const id = r.data.booking.id;
    const link = await api<{ url: string }>(h, 'POST', `/api/public/bookings/${id}/telegram`, {}, { 'x-guest-token': r.data.guestToken });
    await start(h, `/start ${link.data.url.split('start=')[1]}`);
    expect(await remindHolds(h.ctx)).toBe(0);
    h.clock.now = new Date(Date.parse(r.data.booking.holdUntil!) - 30 * 60_000);
    expect(await remindHolds(h.ctx)).toBe(1);
    expect(await remindHolds(h.ctx)).toBe(0);
    expect(sent(h, 4242).at(-1)!.body.text).toContain('Бронь скоро снимется');
    h.clock.now = new Date(Date.parse(r.data.booking.holdUntil!) + 60_000);
    await expireHolds(h.ctx);
    expect(sent(h, 4242).at(-1)!.body.text).toContain('предоплата не поступила');
  });
});
