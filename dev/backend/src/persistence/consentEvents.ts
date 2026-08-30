/**
 * §9.5 auditability — camera consent grant/revocation timestamps. Records
 * WHEN consent changed; never any face data. See migrations/005.
 */
import type pg from 'pg';
import { getPool } from '../db/pool.js';

export async function recordConsentEvent(
  userId: string,
  sessionId: string,
  event: 'granted' | 'revoked',
  pool: pg.Pool = getPool(),
): Promise<void> {
  await pool.query('INSERT INTO camera_consent_events (user_id, session_id, event) VALUES ($1, $2, $3)', [
    userId,
    sessionId,
    event,
  ]);
}
