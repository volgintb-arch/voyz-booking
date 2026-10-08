import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context';
import { confirmDeposit, setStatus } from '../services/bookings';
import { handleUpdate, type TelegramApi, type TgUpdate } from '../services/telegram';

export function telegramRoutes(app: FastifyInstance, ctx: Ctx, api: TelegramApi) {
  app.post('/api/telegram/webhook/:secret', async (req, reply) => {
    const { secret } = req.params as { secret: string };
    if (!ctx.config.TELEGRAM_WEBHOOK_SECRET || secret !== ctx.config.TELEGRAM_WEBHOOK_SECRET) return reply.status(404).send();
    await handleUpdate(ctx, api, req.body as TgUpdate, {
      confirm: (hostId, bookingId) => setStatus(ctx, hostId, bookingId, 'confirmed'),
      decline: (hostId, bookingId) => setStatus(ctx, hostId, bookingId, 'cancelled'),
      depositReceived: (hostId, bookingId) => confirmDeposit(ctx, hostId, bookingId, 'qr'),
    });
    return { ok: true };
  });
}
