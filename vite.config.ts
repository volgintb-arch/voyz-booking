/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sharePages } from './share-pages';

const PUBLIC_URL = process.env.VITE_PUBLIC_URL ?? 'https://volgintb-arch.github.io/voyz-booking/';

// Relative base: the same build works on GitHub Pages (/voyz-booking/),
// inside the iOS/Android shell (Capacitor) and in a Telegram Mini App.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    sharePages(PUBLIC_URL),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'widget.js'],
      manifest: {
        name: 'Voyz Booking',
        short_name: 'Voyz',
        description: 'Бронирование юрт и гостевых домов Кыргызстана',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fonts: only the Latin and Cyrillic subsets (Kyrgyz letters live in cyrillic-ext).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'assets/*-{latin,latin-ext,cyrillic,cyrillic-ext}-*.woff2'],
        globIgnores: ['s/**', 'widget.js', 'og.png'],
        navigateFallbackDenylist: [/\/s\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
