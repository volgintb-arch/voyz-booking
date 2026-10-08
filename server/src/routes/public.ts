import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context';
import { ok } from '../http';
import { GuestBookingBody } from '../schemas';
import { catalog } from '../services/catalog';
import { createGuestBooking, guestCancel, guestReportPaid, guestView } from '../services/bookings';

const guestToken = (req: FastifyRequest) => String(req.headers['x-guest-token'] ?? '');

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/public/catalog', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().optional() }).parse(req.query);
    return ok(reply, await catalog(ctx, slug));
  });

  app.post(
    '/api/public/properties/:slug/bookings',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const body = GuestBookingBody.parse(req.body);
      const { booking, guestToken: token } = await createGuestBooking(ctx, slug, body);
      return ok(reply, { booking: { ...booking, guestPhone: '' }, guestToken: token }, 201);
    },
  );

  app.get('/api/public/bookings/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return ok(reply, await guestView(ctx, id, guestToken(req)));
  });

  app.post('/api/public/bookings/:id/report-paid', async (req, reply) => {
    const { id } = req.params as { id: string };
    await guestReportPaid(ctx, id, guestToken(req));
    return ok(reply, await guestView(ctx, id, guestToken(req)));
  });

  app.post('/api/public/bookings/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    await guestCancel(ctx, id, guestToken(req));
    return ok(reply, await guestView(ctx, id, guestToken(req)));
  });
}
