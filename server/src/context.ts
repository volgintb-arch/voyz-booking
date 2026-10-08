import type { Config } from './config';
import type { Db } from './db';
import type { Notifier } from './services/telegram';

export interface Ctx {
  db: Db;
  config: Config;
  notify: Notifier;
  /** Overridable clock for tests. */
  now: () => Date;
  /** Overridable fetch for tests (Aynes, Telegram, iCal). */
  fetch: typeof fetch;
}
