import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context';
import { one } from '../db';
import type { PropertyRow } from '../model';
import { unitFeed } from '../services/ical';
import { listPhotos, photoBytes } from '../services/photos';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function shareRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/health', async () => ({ ok: true }));

  /** Short link with a preview card for messengers, then straight into the app. */
  app.get('/s/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const p = await one<PropertyRow & { min_price: number | null }>(
      ctx.db,
      `select p.*, (select min(base_price) from categories c where c.property_id = p.id) as min_price
         from properties p where slug = $1 and published`,
      [slug],
    );
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const target = `${ctx.config.APP_URL}#/guest/p/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
    if (!p) return reply.redirect(ctx.config.APP_URL);
    const price = p.min_price ? ` · от ${(p.min_price / 100).toLocaleString('ru-RU')} ${p.currency === 'KGS' ? 'сом' : p.currency} за ночь` : '';
    const description = `${p.region.ru}${price}. ${p.description.ru}`.slice(0, 300);
    // The cover photo makes the link preview in WhatsApp / Telegram.
    const cover = (await listPhotos(ctx, [p.id]))[0];
    const image = cover?.url ?? `${ctx.config.APP_URL}og.png`;
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name.ru)} — Voyz</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Voyz">
<meta property="og:title" content="${esc(p.name.ru)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(`${ctx.config.API_URL}s/${slug}`)}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${cover?.width ?? 1200}"><meta property="og:image:height" content="${cover?.height ?? 630}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body style="font-family:system-ui;padding:24px"><a href="${esc(target)}">${esc(p.name.ru)}</a>
<script>location.replace(${JSON.stringify(target)})</script></body></html>`;
  });

  /** Photo bytes; ids never change content, so browsers and the app cache them forever. */
  app.get('/photos/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const photo = await photoBytes(ctx, file.replace(/\.(jpg|webp|png)$/, ''));
    if (!photo) return reply.status(404).send('Not found');
    reply.header('cache-control', 'public, max-age=31536000, immutable');
    reply.header('access-control-allow-origin', '*');
    reply.type(photo.mime);
    return photo.bytes;
  });

  /** Occupancy feed of one unit for Booking.com / Airbnb (secret token in the URL). */
  app.get('/ical/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const feed = await unitFeed(ctx, file.replace(/\.ics$/, ''));
    if (!feed) return reply.status(404).send('Not found');
    reply.type('text/calendar; charset=utf-8');
    return feed;
  });
}
