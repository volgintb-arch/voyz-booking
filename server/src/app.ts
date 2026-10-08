import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { Ctx } from './context';
import { sendError } from './http';
import { authRoutes } from './routes/auth';
import { hostRoutes } from './routes/host';
import { publicRoutes } from './routes/public';
import { shareRoutes } from './routes/share';
import { telegramRoutes } from './routes/telegram';
import type { TelegramApi } from './services/telegram';

export async function buildApp(ctx: Ctx, api: TelegramApi, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1_000_000, trustProxy: true });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Native apps and server-to-server calls send no Origin.
      if (!origin || ctx.config.corsOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    allowedHeaders: ['content-type', 'authorization', 'x-guest-token'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((err, _req, reply) => sendError(reply, err));
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ ok: false, error: { code: 'not_found', message: 'Not found' } }));

  shareRoutes(app, ctx);
  publicRoutes(app, ctx);
  authRoutes(app, ctx);
  hostRoutes(app, ctx);
  telegramRoutes(app, ctx, api);
  return app;
}
