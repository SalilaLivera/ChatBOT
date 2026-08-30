-- C7 Part B — §9.5 auditability. Camera consent grant/revocation timestamps,
-- recorded per user and per (client-scoped) session id. This is an audit
-- trail only: it records WHEN consent changed, not any face data. Revocation
-- purges the in-memory accumulator immediately (SessionStore) but this table
-- is never used to reconstruct or resurrect it — prospective-only revocation
-- (owner decision, C7_DECISIONS_AND_GAPS.md §1) means historical
-- mood_observations are unaffected by rows here.
CREATE TABLE camera_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('granted', 'revoked')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX camera_consent_events_user_id_idx ON camera_consent_events(user_id);
