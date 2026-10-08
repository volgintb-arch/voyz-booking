import { buildApp } from './app';
import { loadConfig } from './config';
import type { Ctx } from './context';
import { createPool, migrate } from './db';
import { TelegramApi, TelegramNotifier } from './services/telegram';
import { startWorkers } from './workers';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
const applied = await migrate(db);

const api = new TelegramApi(config.TELEGRAM_BOT_TOKEN, fetch);
const ctx: Ctx = { db, config, notify: new TelegramNotifier(db, config, api), now: () => new Date(), fetch };
const app = await buildApp(ctx, api, { logger: true });
if (applied.length) app.log.info({ applied }, 'migrations applied');

if (api.enabled && config.TELEGRAM_WEBHOOK_SECRET) {
  await api.call('setWebhook', {
    url: `${config.API_URL}api/telegram/webhook/${config.TELEGRAM_WEBHOOK_SECRET}`,
    allowed_updates: ['message', 'callback_query'],
  });
}
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
