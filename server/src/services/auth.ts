// Host sign-in through Telegram (D-005). Guests need no account.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Ctx } from '../context';
import { newId, randomToken, sha256 } from '../crypto';
import { one } from '../db';
import { ApiError } from '../http';
import { upsertTelegramHost } from './telegram';

const SESSION_DAYS = 180;
const LOGIN_CODE_MINUTES = 10;

export interface HostIdentity {
  id: string;
  name: string;
  username: string | null;
  lang: string;
}

export async function createSession(ctx: Ctx, hostId: string): Promise<string> {
  const token = randomToken(32);
  const expires = new Date(ctx.now().getTime() + SESSION_DAYS * 86_400_000).toISOString();
  await ctx.db.query('insert into sessions (token_hash, host_id, expires_at) values ($1, $2, $3)', [sha256(token), hostId, expires]);
  return token;
}

export async function requireHost(ctx: Ctx, req: FastifyRequest): Promise<HostIdentity> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new ApiError('unauthorized', 'Sign in required');
  const host = await one<HostIdentity>(
    ctx.db,
    `select h.id, h.name, h.username, h.lang from sessions s join hosts h on h.id = s.host_id
      where s.token_hash = $1 and s.expires_at > $2`,
    [sha256(token), ctx.now().toISOString()],
  );
  if (!host) throw new ApiError('unauthorized', 'Session expired');
  return host;
}

export async function logout(ctx: Ctx, req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) await ctx.db.query('delete from sessions where token_hash = $1', [sha256(header.slice(7))]);
}

/**
 * Step 1: the app asks for a code and opens t.me/<bot>?start=login_<code>.
 * Works the same in the browser, the iOS/Android app and Telegram.
 */
export async function startLogin(ctx: Ctx): Promise<{ code: string; botUrl: string | null; expiresAt: string }> {
  const code = randomToken(12);
  const expiresAt = new Date(ctx.now().getTime() + LOGIN_CODE_MINUTES * 60_000).toISOString();
  await ctx.db.query('insert into login_codes (code, expires_at) values ($1, $2)', [code, expiresAt]);
  const bot = ctx.config.TELEGRAM_BOT_USERNAME;
  return { code, botUrl: bot ? `https://t.me/${bot}?start=login_${code}` : null, expiresAt };
}

/** Step 2: the app polls; once the bot confirmed the code it gets a session (only once). */
export async function pollLogin(ctx: Ctx, code: string): Promise<{ status: 'waiting' } | { status: 'ok'; token: string }> {
  const row = await one<{ host_id: string | null; expires_at: string }>(
    ctx.db,
    `update login_codes set consumed_at = now()
      where code = $1 and confirmed_at is not null and consumed_at is null and expires_at > now()
      returning host_id, expires_at`,
    [code],
  );
  if (row?.host_id) return { status: 'ok', token: await createSession(ctx, row.host_id) };
  const exists = await one<{ expires_at: string }>(ctx.db, 'select expires_at from login_codes where code = $1', [code]);
  if (!exists || Date.parse(exists.expires_at) < ctx.now().getTime()) throw new ApiError('not_found', 'Login code expired');
  return { status: 'waiting' };
}

/** Inside a Telegram Mini App: verify initData signed by Telegram (HMAC-SHA256). */
export function verifyWebAppInitData(initData: string, botToken: string, maxAgeSec = 86_400, nowSec = Date.now() / 1000) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || nowSec - authDate > maxAgeSec) return null;
  const user = JSON.parse(params.get('user') ?? 'null') as {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  } | null;
  return user;
}

export async function loginWithWebApp(ctx: Ctx, initData: string): Promise<string> {
  const user = verifyWebAppInitData(initData, ctx.config.TELEGRAM_BOT_TOKEN, 86_400, ctx.now().getTime() / 1000);
  if (!user) throw new ApiError('unauthorized', 'Telegram data is not valid');
  const host = await upsertTelegramHost(ctx.db, user);
  return createSession(ctx, host.id);
}

/** Demo only (ALLOW_DEV_LOGIN=true): sign in as the owner of the demo properties. */
export async function devLogin(ctx: Ctx): Promise<string> {
  if (!ctx.config.ALLOW_DEV_LOGIN) throw new ApiError('forbidden', 'Dev login is disabled');
  const host = await one<{ id: string }>(ctx.db, `select id from hosts where id = 'host-1'`);
  const id = host?.id ?? (await one<{ id: string }>(ctx.db, `insert into hosts (id, name) values ($1, 'Demo host') returning id`, [newId('h')]))!.id;
  return createSession(ctx, id);
}
