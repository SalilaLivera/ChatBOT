/**
 * ★ C7 (revised) — the local `users` row is NOT an identity or credential
 * store; Supabase owns identity entirely. This table exists only so other
 * tables (`conversations`, `mood_observations`, `camera_consent_events`) can
 * hold a foreign key with referential integrity. Its primary key IS the
 * verified Supabase `sub` (auth.users.id) — never a locally-generated id.
 */
import type pg from 'pg';
import { getPool } from '../db/pool.js';

export interface UserRecord {
  id: string;
  firstSeenAt: Date;
}

/**
 * Idempotent — called on every authenticated request that is about to
 * insert a row referencing this user, so the FK target exists. `id` is
 * ALWAYS the verified JWT `sub`; nothing here ever accepts a client-supplied
 * id as identity.
 */
export async function ensureUser(supabaseUserId: string, pool: pg.Pool = getPool()): Promise<UserRecord> {
  const { rows } = await pool.query(
    `INSERT INTO users (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
     RETURNING id, first_seen_at`,
    [supabaseUserId],
  );
  return { id: rows[0].id, firstSeenAt: rows[0].first_seen_at };
}

export async function findUserById(id: string, pool: pg.Pool = getPool()): Promise<UserRecord | undefined> {
  const { rows } = await pool.query('SELECT id, first_seen_at FROM users WHERE id = $1', [id]);
  return rows[0] ? { id: rows[0].id, firstSeenAt: rows[0].first_seen_at } : undefined;
}
