/**
 * §9.3 / §9.5 / TRAP 1 — message text IS persisted (it is a chat
 * application; the conversation is the product) and is NEVER logged, at any
 * level. This module contains no `logger` import and must never gain one:
 * that is the structural half of the guarantee. The other half — it IS
 * written to Postgres — is the reason this module exists at all.
 */
import type pg from 'pg';
import { getPool } from '../db/pool.js';

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

function mapRow(row: {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: Date;
}): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function insertMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  pool: pg.Pool = getPool(),
): Promise<MessageRecord> {
  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, role, content)
     VALUES ($1, $2, $3)
     RETURNING id, conversation_id, role, content, created_at`,
    [conversationId, role, content],
  );
  return mapRow(rows[0]);
}

export async function listMessages(conversationId: string, pool: pg.Pool = getPool()): Promise<MessageRecord[]> {
  const { rows } = await pool.query(
    'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
  return rows.map(mapRow);
}

/**
 * D-9 (conversation history) — the last `limit` messages for a conversation,
 * chronological (oldest first).
 *
 * ⛔ DELIBERATELY SEPARATE from `listMessages()` above, not a shared helper
 * with a default: `listMessages()` is the `GET .../messages` endpoint's
 * full-history read and must stay unbounded. This function exists because
 * that one must NOT be reused for the per-turn LLM history read — calling it
 * on every turn would refetch and discard the entire conversation each time,
 * a real O(n) cost per turn that grows without bound as a conversation
 * lengthens (D7_HISTORY_PLAN.md §8).
 *
 * `LIMIT` + `ORDER BY created_at DESC` returns the most recent `limit` rows
 * newest-first; reversed here so the caller always receives oldest-first,
 * matching `listMessages()`'s ordering contract.
 */
export async function listRecentMessages(
  conversationId: string,
  limit: number,
  pool: pg.Pool = getPool(),
): Promise<MessageRecord[]> {
  const { rows } = await pool.query(
    `SELECT id, conversation_id, role, content, created_at FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit],
  );
  return rows.map(mapRow).reverse();
}

/**
 * Music-recommendation feature — the deterministic rotation index
 * (`selectThreeSongs` in `content/musicCatalogue.ts`) needs the
 * conversation's TOTAL prior message count, unbounded by
 * `LLM_HISTORY_TURNS`. Deliberately NOT `listRecentMessages(...).length` or
 * `listMessages(...).length` — either would mean fetching full row data
 * (bounded or not) just to discard it for a count, and the bounded one
 * would additionally plateau the rotation once a conversation outgrows the
 * history window. `COUNT(*)` is index-only and O(1) in practice, no new
 * persistence state, no new table or column.
 */
export async function countMessages(conversationId: string, pool: pg.Pool = getPool()): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1', [conversationId]);
  return rows[0]?.count ?? 0;
}
