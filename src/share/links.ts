import type { Channel, LinkSource } from '../domain/types';

export const LINK_SOURCES: LinkSource[] = ['instagram', 'whatsapp', 'telegram', 'qr', 'site', 'direct'];

export function isLinkSource(value: string | null): value is LinkSource {
  return value !== null && (LINK_SOURCES as string[]).includes(value);
}

/** Channel reported to Aynes for a booking that came through a shared link. */
export function channelFor(source: LinkSource): Channel {
  switch (source) {
    case 'instagram':
    case 'whatsapp':
    case 'telegram':
      return source;
    default:
      return 'voyz';
  }
}

export interface ShareOptions {
  src: LinkSource;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
}

function query(o: ShareOptions): string {
  const p = new URLSearchParams({ src: o.src });
  if (o.checkIn && o.checkOut) {
    p.set('in', o.checkIn);
    p.set('out', o.checkOut);
  }
  if (o.guests) p.set('g', String(o.guests));
  return p.toString();
}

/**
 * Short link with a preview card (title, price, picture) for messengers.
 * `/s/<slug>/` is a static page with Open Graph tags that forwards to the app.
 */
export function shareUrl(base: string, slug: string, o: ShareOptions): string {
  return `${base}s/${encodeURIComponent(slug)}/?${query(o)}`;
}

/** Direct route inside the app (used by the site widget iframe). */
export function appUrl(base: string, slug: string, o: ShareOptions & { embed?: boolean }): string {
  return `${base}#/guest/p/${encodeURIComponent(slug)}?${query(o)}${o.embed ? '&embed=1' : ''}`;
}

// The source and embed flag survive navigation inside one visit.
const SRC_KEY = 'voyz:src';
const EMBED_KEY = 'voyz:embed';

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // storage blocked: the booking is simply recorded as 'direct'
  }
}

export function rememberVisit(params: URLSearchParams): void {
  const src = params.get('src');
  if (isLinkSource(src)) write(SRC_KEY, src);
  if (params.get('embed') === '1') write(EMBED_KEY, '1');
}

export function visitSource(): LinkSource {
  const src = read(SRC_KEY);
  return isLinkSource(src) ? src : 'direct';
}

function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // a cross-origin parent: we are inside someone's site
  }
}

/**
 * Widget mode (no tab bar) only inside the site's iframe. The flag alone is not
 * enough: browsers copy sessionStorage into tabs opened from a link, so a host who
 * opened the widget link full-screen would lose the menu for the whole visit.
 */
export function isEmbedded(): boolean {
  return read(EMBED_KEY) === '1' && inFrame();
}
