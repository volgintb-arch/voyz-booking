import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context';
import { confirmDeposit, setStatus } from '../services/bookings';
import { ensureWebhook, handleUpdate, webhookId, type TelegramApi, type TgUpdate } from '../services/telegram';

export function telegramRoutes(app: FastifyInstance, ctx: Ctx, api: TelegramApi) {
  /** Diagnostics for the owner: is the bot connected to this server? (no secrets in the answer) */
  app.get('/api/telegram/status', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async () => ({
    ok: true,
    data: await ensureWebhook(ctx, api),
  }));

  app.post('/api/telegram/webhook/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string };
    const expected = ctx.config.TELEGRAM_WEBHOOK_SECRET ? webhookId(ctx.config.TELEGRAM_WEBHOOK_SECRET) : '';
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (!expected || secret !== expected || (header !== undefined && header !== expected)) return reply.status(404).send();
    await handleUpdate(ctx, api, req.body as TgUpdate, {
      confirm: (hostId, bookingId) => setStatus(ctx, hostId, bookingId, 'confirmed'),
      decline: (hostId, bookingId) => setStatus(ctx, hostId, bookingId, 'cancelled'),
      depositReceived: (hostId, bookingId) => confirmDeposit(ctx, hostId, bookingId, 'qr'),
    });
    return { ok: true };
  });
}
