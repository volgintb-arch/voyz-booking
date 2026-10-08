import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Calendar days stay strings ('2027-07-14'), moments become ISO strings, money numbers.
pg.types.setTypeParser(1082, (v: string) => v); // date
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString()); // timestamptz
pg.types.setTypeParser(20, (v: string) => Number(v)); // bigint (amounts stay far below 2^53)

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

export async function tx<T>(db: Db, fn: (client: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function one<T>(q: Queryable, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await q.query(sql, params);
  return r.rows[0] as T | undefined;
}

export async function many<T>(q: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await q.query(sql, params);
  return r.rows as T[];
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Applies migrations/*.sql once each, in name order. */
export async function migrate(db: Db, dir = path.resolve(here, '../migrations')): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await many<{ name: string }>(db, 'select name from schema_migrations')).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await tx(db, async (c) => {
      await c.query(sql);
      await c.query('insert into schema_migrations(name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
