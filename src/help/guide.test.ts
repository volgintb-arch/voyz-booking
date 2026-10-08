/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ru } from '../i18n/ru';
import { ARTICLES, articleById, toMarkdown } from './articles';

const GUIDE = new URL('../../docs/GUIDE.md', import.meta.url);
const COLORS: [string, keyof typeof ru.host.legend][] = [
  ['Салатовая', 'paid'],
  ['Белая с рамкой', 'confirmed'],
  ['Оранжевая', 'pending'],
  ['Тёмная', 'stay'],
  ['Голубая', 'ical'],
  ['Серая штриховка', 'closed'],
];

describe('host education', () => {
  it('docs/GUIDE.md is the same articles as the app (npm run guide rewrites it)', () => {
    const md = toMarkdown(ARTICLES, COLORS.map(([color, tone]) => [color, ru.host.legend[tone]]));
    if (process.env.UPDATE_GUIDE) writeFileSync(GUIDE, md);
    expect(readFileSync(GUIDE, 'utf8')).toBe(md);
  });

  it('every article has a unique id and buttons lead to real screens', () => {
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
    const screens = ['/host', '/host/bookings', '/host/settings', '/host/promo', '/host/property'];
    for (const a of ARTICLES) {
      for (const b of a.blocks) if (b.type === 'action') expect(screens).toContain(b.to);
    }
    for (const id of ['ota-sync', 'aynes', 'qr-payment', 'board', 'ota-money', 'promo', 'photos']) expect(articleById(id)).toBeDefined();
  });
});
