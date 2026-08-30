/**
 * ★ C7 Part B / D-40 — retention deletion. Proves rows past the retention
 * window are removed and rows within it are not. Requires the live Postgres
 * (see authOwnershipAndPersistence.test.ts header re: O-21).
 *
 * ⛔ This test does NOT call consent revocation anywhere — revocation is
 * prospective-only (owner decision) and must never delete historical rows.
 * The only deletion mechanism exercised here is age-based.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let pool: pg.Pool;
let deleteMoodObservationsOlderThan: typeof import('../../src/persistence/moodObservations.js').deleteMoodObservationsOlderThan;
let ensureUser: typeof import('../../src/persistence/users.js').ensureUser;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgres://maternalink:changeme@localhost:5432/maternalink';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.FER_SERVICE_URL ??= 'http://localhost:7860';
  process.env.SENTIMENT_SERVICE_URL ??= 'http://localhost:8001';
  process.env.FUSION_SERVICE_URL ??= 'http://localhost:9000';

  ({ deleteMoodObservationsOlderThan } = await import('../../src/persistence/moodObservations.js'));
  ({ ensureUser } = await import('../../src/persistence/users.js'));

  const { Pool } = pg;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
});

afterAll(async () => {
  await pool.end();
});

describe('D-40 — mood observation retention deletion', () => {
  it('deletes rows older than the retention window; leaves recent rows untouched', async () => {
    const userId = crypto.randomUUID();
    await ensureUser(userId);

    const insertAt = async (createdAt: string): Promise<string> => {
      const { rows } = await pool.query(
        `INSERT INTO mood_observations
           (user_id, state, confidence, modalities_used, fusion_version, parameters_provenance,
            frame_count, session_elapsed_ms, created_at)
         VALUES ($1, 'calm', 0.5, '["text"]', 'fusion-v1', 'PLACEHOLDER FOR TESTING - NOT A MEASURED VALUE', 0, 0, $2)
         RETURNING id`,
        [userId, createdAt],
      );
      return rows[0].id as string;
    };

    const oldId = await insertAt(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()); // 40 days ago
    const recentId = await insertAt(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()); // 1 day ago

    const deleted = await deleteMoodObservationsOlderThan(30, pool);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const { rows: remaining } = await pool.query('SELECT id FROM mood_observations WHERE id = ANY($1)', [[oldId, recentId]]);
    const remainingIds = remaining.map((r: { id: string }) => r.id);
    expect(remainingIds).not.toContain(oldId);
    expect(remainingIds).toContain(recentId);
  }, 20_000);
});
