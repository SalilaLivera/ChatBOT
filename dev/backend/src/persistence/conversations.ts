import type pg from 'pg';
import { getPool } from '../db/pool.js';

export interface ConversationRecord {
  id: string;
  userId: string;
  createdAt: Date;
}

export async function createConversation(userId: string, pool: pg.Pool = getPool()): Promise<ConversationRecord> {
  const { rows } = await pool.query(
    'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id, user_id, created_at',
    [userId],
  );
  return { id: rows[0].id, userId: rows[0].user_id, createdAt: rows[0].created_at };
}

/**
 * Ownership check WITHOUT distinguishing "doesn't exist" from "belongs to
 * someone else" to the caller (TRAP 2) — returns undefined for both; the
 * route layer logs which case actually happened.
 */
export async function findOwnedConversation(
  id: string,
  userId: string,
  pool: pg.Pool = getPool(),
): Promise<{ found: boolean; owned: boolean }> {
  const { rows } = await pool.query('SELECT user_id FROM conversations WHERE id = $1', [id]);
  if (rows.length === 0) return { found: false, owned: false };
  return { found: true, owned: rows[0].user_id === userId };
}
