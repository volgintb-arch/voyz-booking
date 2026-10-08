// Error reports to Sentry — only when VITE_SENTRY_DSN is set at build time.
// The SDK is loaded lazily, so builds without a DSN do not download it.
// No personal data: guest tokens are cut out of URLs, no IPs, no form contents.

import type { Platform } from './platform';

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

type Report = (error: unknown) => void;
let report: Report = () => {};

/** "…/guest/open/VZ-1?t=secret" → "…/guest/open/VZ-1?t=[filtered]" */
export function scrubUrl(url: string): string {
  return url.replace(/([?&#](?:t|token|key)=)[^&#\s]+/gi, '$1[filtered]');
}

export async function initMonitoring(platform: Platform): Promise<void> {
  if (!DSN) return;
  // Destructured, so the bundler keeps only these parts of the SDK.
  const { init, setTag, captureException } = await import('@sentry/browser');
  init({
    dsn: DSN,
    release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
    environment: import.meta.env.VITE_API_URL ? 'server' : 'demo',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      delete event.user;
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (typeof crumb.data?.url === 'string') crumb.data.url = scrubUrl(crumb.data.url);
      if (typeof crumb.data?.from === 'string') crumb.data.from = scrubUrl(crumb.data.from);
      if (typeof crumb.data?.to === 'string') crumb.data.to = scrubUrl(crumb.data.to);
      return crumb;
    },
  });
  setTag('platform', platform);
  report = (error) => captureException(error);
}

export function reportError(error: unknown): void {
  report(error);
}
