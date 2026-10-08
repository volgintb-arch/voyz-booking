import type { Ctx } from './context';
import { expireHolds } from './services/bookings';
import { syncDue } from './services/ical';
import { flushOutbox } from './services/outbox';
import { morningSummary, type TelegramApi } from './services/telegram';

type Log = { error: (o: unknown, msg?: string) => void };

/** Background jobs in the API process — enough for the pilot (one instance). */
export function startWorkers(ctx: Ctx, api: TelegramApi, log: Log): () => void {
  const jobs: [string, number, () => Promise<unknown>][] = [
    ['outbox', 30_000, () => flushOutbox(ctx)],
    ['holds', 60_000, () => expireHolds(ctx)],
    ['ical', 5 * 60_000, () => syncDue(ctx, 20)],
    ['summary', 10 * 60_000, () => morningSummary(ctx, api)],
  ];
  const timers = jobs.map(([name, every, run]) => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        await run();
      } catch (e) {
        log.error(e, `worker ${name} failed`);
      } finally {
        busy = false;
      }
    };
    setTimeout(tick, 2_000);
    return setInterval(tick, every);
  });
  return () => timers.forEach(clearInterval);
}
