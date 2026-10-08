// Build step: one static page per property at /s/<slug>/ with Open Graph tags,
// so a link pasted into WhatsApp, Telegram or Instagram shows a preview card.
// The page forwards the visitor to the app route, keeping ?src=…&in=…&out=….
// Later the server renders these for every property; for now the demo seed is used.

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { buildSeed } from './src/data/seed';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function sharePages(publicUrl: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'voyz-share-pages',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const seed = buildSeed();
      for (const p of seed.properties) {
        const minPrice = Math.min(...seed.categories.filter((c) => c.propertyId === p.id).map((c) => c.basePrice)) / 100;
        const title = `${p.name.ru} — Voyz`;
        const description = `${p.region.ru} · от ${minPrice.toLocaleString('ru-RU')} сом за ночь. ${p.description.ru}`;
        const target = `../../#/guest/p/${p.slug}`;
        const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Voyz">
<meta property="og:title" content="${esc(p.name.ru)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${publicUrl}s/${p.slug}/">
<meta property="og:image" content="${publicUrl}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${target}">
<script>location.replace(${JSON.stringify(target)} + location.search);</script>
</head>
<body style="font-family:system-ui;padding:24px"><a href="${target}">${esc(p.name.ru)}</a></body>
</html>
`;
        const dir = path.join(outDir, 's', p.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), html);
      }
    },
  };
}
