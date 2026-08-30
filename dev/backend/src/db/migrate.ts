/**
 * Minimal, dependency-free migration runner (C7 — TRAP 5 makes this
 * meaningful, since Postgres now has a durable volume). Applies every
 * `migrations/*.sql` file, in filename order, exactly once, tracked in
 * `schema_migrations`. No down-migrations — this is a forward-only research
 * build, consistent with §11 scope decisions elsewhere in this project.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getPool } from './pool.js';

const MIGRATIONS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'migrations');

export async function runMigrations(pool: pg.Pool = getPool()): Promise<{ applied: string[] }> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const already = new Set(rows.map((r) => r.name));

  const applied: string[] = [];
  for (const file of files) {
    if (already.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }
  return { applied };
}

/* eslint-disable no-console -- CLI entrypoint, not application logging */
async function main(): Promise<void> {
  const pool = getPool();
  try {
    const { applied } = await runMigrations(pool);
    console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'No pending migrations.');
  } finally {
    await pool.end();
  }
}

// Only run as a CLI entrypoint (`npm run migrate`), never on import — tests
// import `runMigrations` directly against a pool they control.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
