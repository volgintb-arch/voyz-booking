// Property photos: upload, order, delete, serve.

import type { Ctx } from '../context';
import { newId } from '../crypto';
import { many, one, tx } from '../db';
import { ApiError, notFound } from '../http';
import { PHOTO_COLUMNS, toPhoto, type PhotoRow } from '../model';
import { assertOwner } from './bookings';

export const MAX_PHOTOS = 20;
export const MAX_BYTES = 2_500_000;

/** Reads width and height from the image header (JPEG, PNG, WebP) — no image library needed. */
export function imageSize(buf: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png') {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (mime === 'image/webp') {
    if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  // JPEG: walk the segments up to a start-of-frame marker.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export async function listPhotos(ctx: Ctx, propertyIds: string[]) {
  const rows = await many<PhotoRow>(ctx.db, `select ${PHOTO_COLUMNS} from photos where property_id = any($1) order by property_id, sort, created_at`, [
    propertyIds,
  ]);
  return rows.map((r) => toPhoto(r, ctx.config.API_URL));
}

export async function addPhoto(ctx: Ctx, hostId: string, propertyId: string, dataUrl: string): Promise<string> {
  await assertOwner(ctx.db, hostId, propertyId);
  const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new ApiError('bad_request', 'Expected a JPEG, WebP or PNG image');
  const mime = m[1]!;
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length > MAX_BYTES) throw new ApiError('bad_request', 'Photo is too large', { maxBytes: MAX_BYTES });
  const size = imageSize(bytes, mime);
  if (!size || size.width < 200 || size.height < 200) throw new ApiError('bad_request', 'Not a valid image or too small');
  return tx(ctx.db, async (c) => {
    await c.query('select id from properties where id = $1 for update', [propertyId]);
    const { n, next } = (await one<{ n: number; next: number }>(
      c,
      'select count(*)::int as n, coalesce(max(sort), -1) + 1 as next from photos where property_id = $1',
      [propertyId],
    ))!;
    if (n >= MAX_PHOTOS) throw new ApiError('conflict', 'Too many photos', { max: MAX_PHOTOS });
    const id = newId('ph');
    await c.query('insert into photos (id, property_id, sort, mime, width, height, size, bytes) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
      id, propertyId, next, mime, size.width, size.height, bytes.length, bytes,
    ]);
    return id;
  });
}

async function ownerOfPhoto(ctx: Ctx, id: string): Promise<{ owner_id: string; property_id: string } | undefined> {
  return one(ctx.db, 'select p.owner_id, p.id as property_id from photos ph join properties p on p.id = ph.property_id where ph.id = $1', [id]);
}

export async function removePhoto(ctx: Ctx, hostId: string, id: string): Promise<void> {
  const o = await ownerOfPhoto(ctx, id);
  if (o?.owner_id !== hostId) notFound();
  await ctx.db.query('delete from photos where id = $1', [id]);
}

/** New order of the property's photos; the first one becomes the cover. */
export async function reorderPhotos(ctx: Ctx, hostId: string, propertyId: string, ids: string[]): Promise<void> {
  await assertOwner(ctx.db, hostId, propertyId);
  await tx(ctx.db, async (c) => {
    for (const [i, id] of ids.entries()) {
      await c.query('update photos set sort = $3 where id = $1 and property_id = $2', [id, propertyId, i]);
    }
  });
}

export async function photoBytes(ctx: Ctx, id: string): Promise<{ mime: string; bytes: Buffer } | undefined> {
  return one(ctx.db, 'select mime, bytes from photos where id = $1', [id]);
}
