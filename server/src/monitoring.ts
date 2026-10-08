// Error reports to Sentry — only when SENTRY_DSN is set. The SDK is loaded lazily.
// Only the route pattern is attached ("/ical/:token"), never the raw URL with secrets.

type Report = (error: unknown, context?: Record<string, unknown>) => void;
let report: Report = () => {};

export async function initMonitoring(dsn: string, release?: string): Promise<boolean> {
  if (!dsn) return false;
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn,
    release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      return event;
    },
  });
  report = (error, context) => Sentry.captureException(error, context ? { extra: context } : undefined);
  return true;
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  report(error, context);
}
