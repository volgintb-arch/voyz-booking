import { buildApp } from './app';
import { loadConfig } from './config';
import type { Ctx } from './context';
import { createPool, migrate } from './db';
import { initMonitoring } from './monitoring';
import { removeDemo, seedDemo } from './demo';
import { ensureWebhook, TelegramApi, TelegramNotifier } from './services/telegram';
import { startWorkers } from './workers';

const config = loadConfig();
// Render passes the deployed commit; elsewhere the release stays unnamed.
if (await initMonitoring(config.SENTRY_DSN, process.env.RENDER_GIT_COMMIT)) console.log('sentry on');
const db = createPool(config.DATABASE_URL, config.DATABASE_SSL);
const applied = await migrate(db);
// Pilot demo (dev sign-in allowed): an empty database gets the four demo properties.
// Real hosts (dev sign-in off): the demo properties are removed.
if (config.ALLOW_DEV_LOGIN) {
  if (await seedDemo(db)) console.log('demo data inserted');
} else {
  const removed = await removeDemo(db);
  if (removed) console.log(`demo data removed: ${removed} properties`);
}

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
