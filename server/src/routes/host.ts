import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../context';
import { ok } from '../http';
import {
  AynesBody,
  BlockBody,
  CategoryPatchBody,
  DepositBody,
  ExtendBody,
  HostBookingBody,
  IcalBody,
  NewPropertyBody,
  PaymentBody,
  PropertyPatchBody,
  SeasonBody,
  StatusBody,
} from '../schemas';
import { requireHost, type HostIdentity } from '../services/auth';
import { addHostPayment, assertOwner, confirmDeposit, createHostBooking, extendHold, setStatus } from '../services/bookings';
import {
  addBlock,
  addIcalChannel,
  addSeason,
  assertOwnsChannel,
  connectAynes,
  createProperty,
  disconnectAynes,
  removeBlock,
  removeIcalChannel,
  removeSeason,
  setShareGuestName,
  snapshot,
  updateCategory,
  updateProperty,
} from '../services/host';
import { syncChannel } from '../services/ical';
import { flushOutbox } from '../services/outbox';
import { z } from 'zod';

type Handler = (host: HostIdentity, req: FastifyRequest) => Promise<unknown>;

export function hostRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Every change answers with the fresh workspace, so the app simply replaces its state. */
  const mutate = (fn: Handler) => async (req: FastifyRequest, reply: FastifyReply) => {
    const host = await requireHost(ctx, req);
    const extra = await fn(host, req);
    return ok(reply, { ...(await snapshot(ctx, host)), result: extra ?? null });
  };
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;

  app.get('/api/host/state', async (req, reply) => ok(reply, await snapshot(ctx, await requireHost(ctx, req))));

  app.post('/api/host/properties', mutate(async (h, req) => ({ propertyId: await createProperty(ctx, h.id, NewPropertyBody.parse(req.body)) })));
  app.patch('/api/host/properties/:id', mutate((h, req) => updateProperty(ctx, h.id, id(req), PropertyPatchBody.parse(req.body))));
  app.patch('/api/host/categories/:id', mutate((h, req) => updateCategory(ctx, h.id, id(req), CategoryPatchBody.parse(req.body))));
  app.post('/api/host/properties/:id/seasons', mutate((h, req) => addSeason(ctx, h.id, id(req), SeasonBody.parse(req.body))));
  app.delete('/api/host/seasons/:id', mutate((h, req) => removeSeason(ctx, h.id, id(req))));
  app.post('/api/host/units/:id/blocks', mutate((h, req) => addBlock(ctx, h.id, id(req), BlockBody.parse(req.body))));
  app.delete('/api/host/blocks/:id', mutate((h, req) => removeBlock(ctx, h.id, id(req))));
  app.post('/api/host/units/:id/ical-channels', mutate((h, req) => addIcalChannel(ctx, h.id, id(req), IcalBody.parse(req.body))));
  app.delete('/api/host/ical-channels/:id', mutate((h, req) => removeIcalChannel(ctx, h.id, id(req))));
  app.post(
    '/api/host/ical-channels/:id/sync',
    mutate(async (h, req) => {
      await assertOwnsChannel(ctx, h.id, id(req));
      return syncChannel(ctx, id(req));
    }),
  );

  app.put(
    '/api/host/properties/:id/aynes',
    mutate(async (h, req) => {
      const body = AynesBody.parse(req.body);
      await connectAynes(ctx, h.id, id(req), body.key, body.shareGuestName);
      return flushOutbox(ctx, id(req));
    }),
  );
  app.patch(
    '/api/host/properties/:id/aynes',
    mutate((h, req) => setShareGuestName(ctx, h.id, id(req), z.object({ shareGuestName: z.boolean() }).parse(req.body).shareGuestName)),
  );
  app.delete('/api/host/properties/:id/aynes', mutate((h, req) => disconnectAynes(ctx, h.id, id(req))));
  app.post(
    '/api/host/properties/:id/outbox/flush',
    mutate(async (h, req) => {
      await assertOwner(ctx.db, h.id, id(req));
      await ctx.db.query(`update outbox set status = 'pending', next_attempt_at = now() where property_id = $1 and status = 'failed'`, [id(req)]);
      return flushOutbox(ctx, id(req));
    }),
  );

  app.post('/api/host/properties/:id/bookings', mutate((h, req) => createHostBooking(ctx, h.id, id(req), HostBookingBody.parse(req.body))));
  app.post('/api/host/bookings/:id/status', mutate((h, req) => setStatus(ctx, h.id, id(req), StatusBody.parse(req.body).status)));
  app.post('/api/host/bookings/:id/payments', mutate((h, req) => addHostPayment(ctx, h.id, id(req), PaymentBody.parse(req.body))));
  app.post('/api/host/bookings/:id/deposit-received', mutate((h, req) => confirmDeposit(ctx, h.id, id(req), DepositBody.parse(req.body).method)));
  app.post('/api/host/bookings/:id/extend-hold', mutate((h, req) => extendHold(ctx, h.id, id(req), ExtendBody.parse(req.body).hours)));
}
