// Telegram bot: host sign-in, notifications with action buttons, morning summary (D-004).

import { nightsBetween, todayIn } from '../../../src/domain/dates';
import { formatMoney } from '../../../src/domain/money';
import type { Booking, Lang } from '../../../src/domain/types';
import type { Config } from '../config';
import type { Ctx } from '../context';
import { newId } from '../crypto';
import { many, one, type Db } from '../db';
import { createHash } from 'node:crypto';
import { botCopy } from './bot-copy';

export interface Notifier {
  bookingCreated(ownerId: string, booking: Booking): Promise<void>;
  guestReportedPaid(ownerId: string, booking: Booking): Promise<void>;
  guestCancelled(ownerId: string, booking: Booking): Promise<void>;
  holdExpired(ownerId: string, booking: Booking): Promise<void>;
  icalConflict(ownerId: string, text: string): Promise<void>;
}

export const silentNotifier: Notifier = {
  bookingCreated: async () => {},
  guestReportedPaid: async () => {},
  guestCancelled: async () => {},
  holdExpired: async () => {},
  icalConflict: async () => {},
};

type Button = { text: string; callback_data?: string; url?: string };

export class TelegramApi {
  constructor(
    private token: string,
    private doFetch: typeof fetch,
  ) {}

  get enabled(): boolean {
    return this.token !== '';
  }

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    try {
      const res = await this.doFetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json()) as { ok: boolean; result?: T };
      return json.ok ? json.result : undefined;
    } catch {
      return undefined; // a missed notification must never break a booking
    }
  }

  /** Same as call(), but keeps Telegram's error text for diagnostics. */
  async raw<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: T; description?: string }> {
    if (!this.enabled) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is empty' };
    try {
      const res = await this.doFetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      return (await res.json()) as { ok: boolean; result?: T; description?: string };
    } catch (e) {
      return { ok: false, description: e instanceof Error ? e.message : String(e) };
    }
  }

  send(chatId: number, text: string, buttons: Button[][] = []) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }
}

interface HostChat {
  telegram_id: number | null;
  lang: Lang;
}

function dateLabel(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function instantLabel(iso: string, tz: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
}

export class TelegramNotifier implements Notifier {
  constructor(
    private db: Db,
    private config: Config,
    private api: TelegramApi,
  ) {}

  private async chat(ownerId: string): Promise<HostChat | undefined> {
    const h = await one<HostChat>(this.db, 'select telegram_id, lang from hosts where id = $1', [ownerId]);
    return h?.telegram_id ? h : undefined;
  }

  /** "«Сон-Куль Айыл» · Юрта 3\n14 июл. — 17 июл. · 3 ночи · 2 гостя\nАйгерим · +996…" */
  async describe(booking: Booking, lang: Lang): Promise<string> {
    const c = botCopy(lang);
    const p = await one<{ name: Record<Lang, string>; timezone: string }>(this.db, 'select name, timezone from properties where id = $1', [booking.propertyId]);
    const u = await one<{ name: string }>(this.db, 'select name from units where id = $1', [booking.unitId]);
    const lines = [
      `«${p?.name[lang] ?? ''}» · ${u?.name ?? ''} · ${booking.id}`,
      `${dateLabel(booking.checkIn, lang)} — ${dateLabel(booking.checkOut, lang)} · ${c.nights(nightsBetween(booking.checkIn, booking.checkOut))} · ${c.guests(booking.guests)}`,
      `${booking.guestName}${booking.guestPhone ? ` · ${booking.guestPhone}` : ''}`,
      `${c.total}: ${formatMoney(booking.total, booking.currency, lang)}`,
    ];
    if (booking.prepaymentDue > 0 && booking.status === 'pending') {
      lines.push(c.deposit(formatMoney(booking.prepaymentDue, booking.currency, lang), booking.holdUntil ? instantLabel(booking.holdUntil, p?.timezone ?? 'Asia/Bishkek', lang) : ''));
    }
    return lines.join('\n');
  }

  private openButton(booking: Booking, lang: Lang): Button[] {
    return [{ text: botCopy(lang).open, url: `${this.config.APP_URL}#/host/b/${encodeURIComponent(booking.id)}` }];
  }

  actionButtons(booking: Booking, lang: Lang): Button[][] {
    const c = botCopy(lang);
    const rows: Button[][] = [];
    if (booking.status === 'pending') {
      rows.push([
        { text: c.confirm, callback_data: `c:${booking.id}` },
        { text: c.decline, callback_data: `d:${booking.id}` },
      ]);
      if (booking.prepaymentDue > 0) rows.push([{ text: c.received, callback_data: `p:${booking.id}` }]);
    }
    rows.push(this.openButton(booking, lang));
    return rows;
  }

  async bookingCreated(ownerId: string, booking: Booking) {
    const h = await this.chat(ownerId);
    if (!h) return;
    await this.api.send(h.telegram_id!, `🆕 ${botCopy(h.lang).newBooking}\n${await this.describe(booking, h.lang)}`, this.actionButtons(booking, h.lang));
  }

  async guestReportedPaid(ownerId: string, booking: Booking) {
    const h = await this.chat(ownerId);
    if (!h) return;
    await this.api.send(h.telegram_id!, `💸 ${botCopy(h.lang).guestPaid}\n${await this.describe(booking, h.lang)}`, this.actionButtons(booking, h.lang));
  }

  async guestCancelled(ownerId: string, booking: Booking) {
    const h = await this.chat(ownerId);
    if (!h) return;
    await this.api.send(h.telegram_id!, `↩️ ${botCopy(h.lang).guestCancelled}\n${await this.describe(booking, h.lang)}`, [this.openButton(booking, h.lang)]);
  }

  async holdExpired(ownerId: string, booking: Booking) {
    const h = await this.chat(ownerId);
    if (!h) return;
    await this.api.send(h.telegram_id!, `⌛ ${botCopy(h.lang).holdExpired}\n${await this.describe(booking, h.lang)}`, [this.openButton(booking, h.lang)]);
  }

  async icalConflict(ownerId: string, text: string) {
    const h = await this.chat(ownerId);
    if (!h) return;
    await this.api.send(h.telegram_id!, `⚠️ ${botCopy(h.lang).icalConflict}\n${text}`);
  }
}

// ---------- Incoming updates (webhook) ----------

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgUpdate {
  message?: { chat: { id: number }; from?: TgUser; text?: string };
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } };
}

function langOf(code: string | undefined): Lang {
  return code === 'ky' ? 'ky' : code === 'en' ? 'en' : 'ru';
}

/** Finds the host by Telegram account or creates one on first contact. */
export async function upsertTelegramHost(db: Db, user: TgUser): Promise<{ id: string; lang: Lang }> {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Host';
  const row = await one<{ id: string; lang: Lang }>(
    db,
    `insert into hosts (id, telegram_id, name, username, lang) values ($1, $2, $3, $4, $5)
     on conflict (telegram_id) do update set name = excluded.name, username = excluded.username
     returning id, lang`,
    [newId('h'), user.id, name, user.username ?? null, langOf(user.language_code)],
  );
  return row!;
}

export interface BotActions {
  confirm(hostId: string, bookingId: string): Promise<unknown>;
  decline(hostId: string, bookingId: string): Promise<unknown>;
  depositReceived(hostId: string, bookingId: string): Promise<unknown>;
}

export async function handleUpdate(ctx: Ctx, api: TelegramApi, update: TgUpdate, actions: BotActions): Promise<void> {
  const msg = update.message;
  if (msg?.text?.startsWith('/start') && msg.from) {
    const host = await upsertTelegramHost(ctx.db, msg.from);
    const c = botCopy(host.lang);
    const payload = msg.text.split(' ')[1] ?? '';
    if (payload.startsWith('login_')) {
      const r = await ctx.db.query(
        `update login_codes set host_id = $2, confirmed_at = now()
          where code = $1 and confirmed_at is null and expires_at > now()`,
        [payload.slice('login_'.length), host.id],
      );
      await api.send(msg.chat.id, r.rowCount ? c.loginOk : c.loginExpired);
      return;
    }
    await api.send(msg.chat.id, c.welcome);
    return;
  }

  const cb = update.callback_query;
  if (cb?.data) {
    const host = await one<{ id: string; lang: Lang }>(ctx.db, 'select id, lang from hosts where telegram_id = $1', [cb.from.id]);
    const c = botCopy(host?.lang ?? 'ru');
    const [action, bookingId] = cb.data.split(':') as [string, string | undefined];
    let doneText: string | null = null;
    if (host && bookingId) {
      try {
        if (action === 'c') {
          await actions.confirm(host.id, bookingId);
          doneText = c.done.confirmed;
        } else if (action === 'd') {
          await actions.decline(host.id, bookingId);
          doneText = c.done.cancelled;
        } else if (action === 'p') {
          await actions.depositReceived(host.id, bookingId);
          doneText = c.done.deposit;
        }
      } catch {
        doneText = null;
      }
    }
    await api.call('answerCallbackQuery', { callback_query_id: cb.id, text: doneText ?? c.notYours });
    if (doneText && cb.message) {
      await api.call('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text ?? ''}\n\n${doneText}`,
      });
    }
  }
}

// ---------- Morning summary ----------

/** Once a day at 08:00 property time: who arrives and leaves today. */
export async function morningSummary(ctx: Ctx, api: TelegramApi): Promise<number> {
  if (!api.enabled) return 0;
  const props = await many<{ id: string; name: Record<Lang, string>; timezone: string; telegram_id: number; lang: Lang }>(
    ctx.db,
    `select p.id, p.name, p.timezone, h.telegram_id, h.lang from properties p join hosts h on h.id = p.owner_id
      where h.telegram_id is not null`,
  );
  let sent = 0;
  for (const p of props) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: p.timezone }).format(ctx.now()));
    if (hour !== 8) continue;
    const today = todayIn(p.timezone, ctx.now());
    const key = `summary:${p.id}:${today}`;
    const fresh = await ctx.db.query('insert into notification_log(key) values ($1) on conflict do nothing', [key]);
    if (!fresh.rowCount) continue;
    const rows = await many<{ guest_name: string; unit: string; check_in: string; check_out: string; status: string }>(
      ctx.db,
      `select b.guest_name, u.name as unit, b.check_in, b.check_out, b.status from bookings b join units u on u.id = b.unit_id
        where b.property_id = $1 and (b.check_in = $2 or b.check_out = $2 or b.status = 'pending')
          and b.status in ('pending','confirmed','checked_in')`,
      [p.id, today],
    );
    const c = botCopy(p.lang);
    const arrivals = rows.filter((r) => r.check_in === today && r.status !== 'checked_in');
    const departures = rows.filter((r) => r.check_out === today);
    const pending = rows.filter((r) => r.status === 'pending').length;
    const lines = [`☀️ ${c.summary(p.name[p.lang])}`];
    if (arrivals.length) lines.push(`${c.arrivals}: ${arrivals.map((r) => `${r.guest_name} (${r.unit})`).join(', ')}`);
    if (departures.length) lines.push(`${c.departures}: ${departures.map((r) => `${r.guest_name} (${r.unit})`).join(', ')}`);
    if (pending) lines.push(c.pending(pending));
    if (lines.length === 1) lines.push(c.nothing);
    await api.send(p.telegram_id, lines.join('\n'));
    sent++;
  }
  return sent;
}

// ---------- Webhook health ----------

/**
 * URL-safe id derived from TELEGRAM_WEBHOOK_SECRET. Generated secrets may contain
 * "/", "+" or "=" which break the URL path (Telegram then gets 404).
 */
export function webhookId(secret: string): string {
  return createHash('sha256').update(`tg-webhook:${secret}`).digest('hex').slice(0, 48);
}

export interface BotStatus {
  tokenSet: boolean;
  secretSet: boolean;
  botUsername: string | null;
  configuredUsername: string;
  webhookOk: boolean;
  webhookHost: string | null;
  pendingUpdates: number | null;
  lastError: string | null;
  fixed: boolean;
}

/**
 * Makes sure Telegram sends updates to this server. Another service using the same
 * bot (or a getUpdates poller) silently steals them — this re-claims the webhook.
 */
export async function ensureWebhook(ctx: Ctx, api: TelegramApi): Promise<BotStatus> {
  const secret = ctx.config.TELEGRAM_WEBHOOK_SECRET;
  const status: BotStatus = {
    tokenSet: api.enabled,
    secretSet: secret !== '',
    botUsername: null,
    configuredUsername: ctx.config.TELEGRAM_BOT_USERNAME,
    webhookOk: false,
    webhookHost: null,
    pendingUpdates: null,
    lastError: null,
    fixed: false,
  };
  if (!api.enabled) return status;
  const me = await api.raw<{ username: string }>('getMe');
  if (!me.ok) return { ...status, lastError: me.description ?? 'getMe failed' };
  status.botUsername = me.result?.username ?? null;
  if (!secret) return { ...status, lastError: 'TELEGRAM_WEBHOOK_SECRET is empty' };
  const id = webhookId(secret);
  const want = `${ctx.config.API_URL}api/telegram/webhook/${id}`;
  const info = await api.raw<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo');
  if (info.ok && info.result) {
    status.webhookHost = info.result.url ? new URL(info.result.url).host : null;
    status.pendingUpdates = info.result.pending_update_count;
    status.lastError = info.result.last_error_message ?? null;
    status.webhookOk = info.result.url === want;
  }
  if (!status.webhookOk) {
    const set = await api.raw('setWebhook', { url: want, secret_token: id, allowed_updates: ['message', 'callback_query'] });
    status.fixed = set.ok;
    status.webhookOk = set.ok;
    if (!set.ok) status.lastError = set.description ?? 'setWebhook failed';
    else status.webhookHost = new URL(want).host;
  }
  return status;
}
