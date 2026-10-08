import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context';
import { ok } from '../http';
import { devLogin, loginWithWebApp, logout, pollLogin, startLogin } from '../services/auth';

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const limited = { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } };

  app.post('/api/auth/telegram/start', limited, async (_req, reply) => ok(reply, await startLogin(ctx)));

  app.get('/api/auth/telegram/poll', async (req, reply) => {
    const { code } = z.object({ code: z.string().min(8).max(40) }).parse(req.query);
    return ok(reply, await pollLogin(ctx, code));
  });

  app.post('/api/auth/telegram/webapp', limited, async (req, reply) => {
    const { initData } = z.object({ initData: z.string().min(10).max(5000) }).parse(req.body);
    return ok(reply, { token: await loginWithWebApp(ctx, initData) });
  });

  app.post('/api/auth/dev', limited, async (_req, reply) => ok(reply, { token: await devLogin(ctx) }));

  app.post('/api/auth/logout', async (req, reply) => {
    await logout(ctx, req);
    return ok(reply, {});
  });

  app.get('/api/auth/options', async (_req, reply) =>
    ok(reply, { telegram: ctx.config.TELEGRAM_BOT_USERNAME !== '', dev: ctx.config.ALLOW_DEV_LOGIN }),
  );
}
