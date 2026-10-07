import type { Currency, Lang } from './types';

const LOCALES: Record<Lang, string> = { ru: 'ru-RU', ky: 'ky-KG', en: 'en-US' };

const SYMBOLS: Record<Currency, string> = { KGS: 'сом', USD: '$', RUB: '₽', KZT: '₸' };

/** Formats integer minor units: 1800000 KGS → "18 000 сом". */
export function formatMoney(amount: number, currency: Currency, lang: Lang): string {
  const major = amount / 100;
  const number = new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return currency === 'USD' ? `$${number}` : `${number} ${SYMBOLS[currency]}`;
}

/** Parses user input in major units ("1 500", "1500,50") into minor units. */
export function parseMajor(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.') as [string, string?];
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Percentage of an amount, rounded to whole minor units. */
export function percentOf(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}
