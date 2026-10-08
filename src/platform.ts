// Runtime environment: browser / installed PWA, native shell (Capacitor), Telegram Mini App.

import { Capacitor } from '@capacitor/core';

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  initData: string;
  openTelegramLink?: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export type Platform = 'ios' | 'android' | 'telegram' | 'web';

export function detectPlatform(): Platform {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  if (window.Telegram?.WebApp?.initData) return 'telegram';
  return 'web';
}

export function initPlatform(): Platform {
  const platform = detectPlatform();
  document.documentElement.dataset.platform = platform;
  if (platform === 'telegram') {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  }
  return platform;
}
