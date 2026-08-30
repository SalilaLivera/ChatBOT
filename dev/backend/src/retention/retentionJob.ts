/**
 * D-40 — mood-observation retention deletion. Deletes rows older than the
 * configured retention period (owner-decided, 30 days by default; §5.3).
 *
 * ⛔ This function is NEVER called from consent revocation — revocation is
 * prospective-only (owner decision §1) and never deletes historical rows.
 * This is the ONLY deletion mechanism for mood_observations, and it is
 * driven purely by age.
 *
 * Whether this runs on a scheduler is a C8 deployment concern; C7 builds the
 * mechanism and a test proving it works, not the schedule (D-40 §5.4).
 */
import { env } from '../config/env.js';
import { deleteMoodObservationsOlderThan } from '../persistence/moodObservations.js';
import { logger } from '../logging/logger.js';

export async function runRetentionSweep(retentionDays: number = env.MOOD_OBSERVATION_RETENTION_DAYS): Promise<number> {
  const deleted = await deleteMoodObservationsOlderThan(retentionDays);
  logger.info({ retentionDays, deleted }, 'mood observation retention sweep complete');
  return deleted;
}
