import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import type { Ctx } from '../src/context';
import { createPool, migrate, type Db } from '../src/db';
import { seedDemo } from '../src/demo';
import { TelegramApi, TelegramNotifier, type Notifier } from '../src/services/telegram';

export const TEST_DB = process.env.DATABASE_URL_TEST ?? 'postgres://voyz:voyz@localhost:5432/voyz_test';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Harness {
  app: FastifyInstance;
  ctx: Ctx;
  db: Db;
  clock: { now: Date };
  calls: Call[];
  /** Next responses for URLs containing the key (e.g. 'aynes', 'ical.example'). */
  respond: Map<string, () => Response>;
  events: { kind: string; ownerId: string; id: string }[];
  close: () => Promise<void>;
}

let pool: Db | null = null;

async function db(): Promise<Db> {
  if (!pool) {
    pool = createPool(TEST_DB);
    await migrate(pool);
  }
  return pool;
}

export async function resetDb(d: Db): Promise<void> {
  await d.query(`truncate hosts, sessions, login_codes, properties, categories, units, seasons, ical_channels, blocks,
                  bookings, payments, outbox, notification_log, photos restart identity cascade`);
}

export async function harness(env: Partial<Record<string, string>> = {}, opts: { seed?: boolean; realNotifier?: boolean } = {}): Promise<Harness> {
  const d = await db();
  await resetDb(d);
  const clock = { now: new Date('2027-06-01T06:00:00Z') };
  if (opts.seed !== false) await seedDemo(d, clock.now);
  const config: Config = loadConfig({
    DATABASE_URL: TEST_DB,
    SERVER_SECRET: 'test-secret-test-secret-test-secret-1234',
    API_URL: 'https://api.test/',
    APP_URL: 'https://app.test/',
    CORS_ORIGINS: 'https://app.test',
    AYNES_API_URL: 'https://aynes.test',
    TELEGRAM_WEBHOOK_SECRET: 'hook',
    TELEGRAM_BOT_USERNAME: 'voyz_test_bot',
    ...env,
  } as NodeJS.ProcessEnv);
  const calls: Call[] = [];
  const respond = new Map<string, () => Response>();
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body.startsWith('{') ? init.body : '{}') : null,
    });
    for (const [key, make] of respond) if (url.includes(key)) return make();
    if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: {} });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const events: Harness['events'] = [];
  const record =
    (kind: string) =>
    async (ownerId: string, b: { id: string } | string) => {
      events.push({ kind, ownerId, id: typeof b === 'string' ? b : b.id });
    };
  const recorder: Notifier = {
    bookingCreated: record('created'),
    guestReportedPaid: record('paid'),
    guestCancelled: record('cancelled'),
    holdExpired: record('expired'),
    icalConflict: record('ical'),
    guestUpdate: async (id, event) => {
      events.push({ kind: `guest:${event}`, ownerId: '', id });
    },
  };
  const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN ?? 'test-token', fakeFetch);
  const ctx: Ctx = {
    db: d,
    config,
    notify: opts.realNotifier ? new TelegramNotifier(d, config, api) : recorder,
    now: () => clock.now,
    fetch: fakeFetch,
  };
  const app = await buildApp(ctx, api);
  return { app, ctx, db: d, clock, calls, respond, events, close: () => app.close() };
}

export async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; ok: boolean; data: T; error?: { code: string; details?: unknown } }> {
  const res = await h.app.inject({ method, url, payload: body as never, headers });
  const json = res.json() as { ok: boolean; data: T; error?: { code: string } };
  return { status: res.statusCode, ...json };
}

export async function devToken(h: Harness): Promise<string> {
  const r = await api<{ token: string }>(h, 'POST', '/api/auth/dev');
  return r.data.token;
}

export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
