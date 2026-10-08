import { buildApp } from './app';
import { loadConfig } from './config';
import type { Ctx } from './context';
import { createPool, migrate } from './db';
import { seedDemo } from './demo';
import { ensureWebhook, TelegramApi, TelegramNotifier } from './services/telegram';
import { startWorkers } from './workers';

const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_SSL);
const applied = await migrate(db);
// Pilot demo (dev sign-in allowed): an empty database gets the four demo properties.
if (config.ALLOW_DEV_LOGIN && (await seedDemo(db))) console.log('demo data inserted');

const api = new TelegramApi(config.TELEGRAM_BOT_TOKEN, fetch);
const ctx: Ctx = { db, config, notify: new TelegramNotifier(db, config, api), now: () => new Date(), fetch };
const app = await buildApp(ctx, api, { logger: true });
if (applied.length) app.log.info({ applied }, 'migrations applied');

app.log.info({ bot: await ensureWebhook(ctx, api) }, 'telegram webhook');
const stop = config.RUN_WORKERS ? startWorkers(ctx, api, app.log) : () => {};

await app.listen({ port: config.PORT, host: config.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    stop();
    await app.close();
    await db.end();
    process.exit(0);
  });
}
