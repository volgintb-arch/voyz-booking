import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  API_URL: z.string().url().default('http://localhost:8080/'),
  APP_URL: z.string().url().default('https://volgintb-arch.github.io/voyz-booking/'),
  CORS_ORIGINS: z.string().default(''),
  SERVER_SECRET: z.string().min(32, 'SERVER_SECRET must be at least 32 characters'),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  // "@voyz_bot" and "voyz_bot" both work.
  TELEGRAM_BOT_USERNAME: z
    .string()
    .default('')
    .transform((v) => v.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '')),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  AYNES_API_URL: z.string().url().default('https://aynes.pro'),
  ALLOW_DEV_LOGIN: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  RUN_WORKERS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof Env> & { corsOrigins: string[] };

const withSlash = (u: string) => (u.endsWith('/') ? u : `${u}/`);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Render tells the service its own public address — no need to type API_URL by hand.
  const parsed = Env.parse({ ...env, API_URL: env.API_URL || env.RENDER_EXTERNAL_URL || undefined });
  return {
    ...parsed,
    API_URL: withSlash(parsed.API_URL),
    APP_URL: withSlash(parsed.APP_URL),
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
