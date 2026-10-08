import { API_URL, apiMode } from './api/client';

/**
 * Public address of the guest app. Share links, QR posters and the site
 * widget point here. Switch to the Voyz domain (e.g. https://voyz.kg/) via
 * VITE_PUBLIC_URL once it is chosen — DECISIONS.md, "Открыто".
 */
export const PUBLIC_URL: string = import.meta.env.VITE_PUBLIC_URL ?? 'https://volgintb-arch.github.io/voyz-booking/';

/**
 * Where short links /s/<slug> live: the server renders a preview for every
 * property; in demo mode the static pages built with the app are used.
 */
export const SHARE_URL: string = apiMode ? API_URL : PUBLIC_URL;
