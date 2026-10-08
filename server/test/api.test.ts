import { afterEach, describe, expect, it } from 'vitest';
import { api, bearer, devToken, harness, type Harness } from './helpers';
import { createHmac } from 'node:crypto';
import { verifyWebAppInitData } from '../src/services/auth';
import { webhookId } from '../src/services/telegram';
import { expireHolds } from '../src/services/bookings';
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
