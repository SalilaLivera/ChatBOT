/**
 * §9.3 / TRAP 4 — durable mood observations. `parametersProvenance` is
 * required by the type system here as well as by the NOT NULL column: there
 * is no optional variant of this function, so an unattributable mood cannot
 * be constructed even by a future caller who forgets to check.
 */
import type pg from 'pg';
import { getPool } from '../db/pool.js';

export interface NewMoodObservation {
  userId: string;
  conversationId: string | null;
  state: string;
  confidence: number;
  modalitiesUsed: string[];
  fusionVersion: string;
  faceModelVersion: string | null;
  textModelVersion: string | null;
  parametersProvenance: string;
  frameCount: number;
  sessionElapsedMs: number;
}

export interface MoodObservationRecord extends NewMoodObservation {
  id: string;
  createdAt: Date;
}

export async function insertMoodObservation(
  obs: NewMoodObservation,
  pool: pg.Pool = getPool(),
): Promise<MoodObservationRecord> {
  const { rows } = await pool.query(
    `INSERT INTO mood_observations
       (user_id, conversation_id, state, confidence, modalities_used, fusion_version,
        face_model_version, text_model_version, parameters_provenance, frame_count, session_elapsed_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, user_id, conversation_id, state, confidence, modalities_used, fusion_version,
               face_model_version, text_model_version, parameters_provenance, frame_count,
               session_elapsed_ms, created_at`,
    [
      obs.userId,
      obs.conversationId,
      obs.state,
      obs.confidence,
      JSON.stringify(obs.modalitiesUsed),
      obs.fusionVersion,
      obs.faceModelVersion,
      obs.textModelVersion,
      obs.parametersProvenance,
      obs.frameCount,
      obs.sessionElapsedMs,
    ],
  );
  const row = rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    state: row.state,
    confidence: row.confidence,
    modalitiesUsed: row.modalities_used,
    fusionVersion: row.fusion_version,
    faceModelVersion: row.face_model_version,
    textModelVersion: row.text_model_version,
    parametersProvenance: row.parameters_provenance,
    frameCount: row.frame_count,
    sessionElapsedMs: row.session_elapsed_ms,
    createdAt: row.created_at,
  };
}

/**
 * §5.4 (D-40) retention — deletes mood observations older than
 * `retentionDays`. Returns the count deleted. This is the mechanism; whether
 * it runs on a scheduler is a C8 deployment concern, not built here.
 *
 * ⛔ Consent revocation is prospective-only and NEVER calls this function —
 * historical face-derived observations are retained until they age out under
 * this policy, not deleted on revocation (owner decision, §1).
 */
export async function deleteMoodObservationsOlderThan(
  retentionDays: number,
  pool: pg.Pool = getPool(),
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM mood_observations WHERE created_at < now() - ($1 || ' days')::interval`,
    [retentionDays],
  );
  return rowCount ?? 0;
}
