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
