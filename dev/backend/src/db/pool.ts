/**
 * The single PostgreSQL connection pool (C7 — Part B). Constructed lazily so
 * importing this module (or anything that imports it) never opens a socket —
 * the same convention `clients/*.ts` already use for upstream HTTP clients.
 *
 * `env.DATABASE_URL` is the only place a connection string comes from
 * (§2.1 rule 4 — the environment is read only inside src/config/).
 */
import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  pool ??= new Pool({ connectionString: env.DATABASE_URL });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export type { QueryResult } from 'pg';
