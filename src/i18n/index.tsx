import type { Lang } from '../domain/types';
import { useStore } from '../data/store';
import { en } from './en';
import { ky } from './ky';
import { ru, type Dict } from './ru';

export const DICTS: Record<Lang, Dict> = { ru, ky, en };
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Рус' },
  { code: 'ky', label: 'Кыр' },
  { code: 'en', label: 'Eng' },
];

const LOCALES: Record<Lang, string> = { ru: 'ru-RU', ky: 'ky-KG', en: 'en-GB' };

export function useT() {
  const { state, update } = useStore();
  const lang = state.lang;
  const t = DICTS[lang];
  const setLang = (l: Lang) => update((s) => ({ ...s, lang: l }));
  /** "14 июл." style short date for a calendar day. */
  const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
    new Intl.DateTimeFormat(LOCALES[lang], { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const fmtRange = (from: string, to: string) => `${fmtDate(from)} — ${fmtDate(to)}`;
  const fmtInstant = (iso: string) =>
    new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bishkek' }).format(new Date(iso));
  return { t, lang, setLang, fmtDate, fmtRange, fmtInstant };
}
