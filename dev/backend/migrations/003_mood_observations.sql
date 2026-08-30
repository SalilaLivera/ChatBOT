-- C7 Part B — §9.3 / TRAP 4. Every mood this system has ever produced is
-- placeholder-derived (C9 unresolved); a row written today must remain
-- distinguishable from one written after C9, indefinitely. That is why
-- parameters_provenance is NOT NULL and has NO default — a row without it
-- would be an unattributable mood, and no application code path may insert
-- one.
--
-- frame_count and session_elapsed_ms are not optional instrumentation
-- (§3A.8) — they are what make the cumulative-average responsiveness
-- question answerable later from real sessions.
--
-- ⛔ No face image, crop, or per-frame prediction is ever a column here.
CREATE TABLE mood_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  state TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  modalities_used JSONB NOT NULL,
  fusion_version TEXT NOT NULL,

  face_model_version TEXT,
  text_model_version TEXT,

  -- ⛔ NOT NULL, no default (TRAP 4) — an unattributable mood may not be stored.
  parameters_provenance TEXT NOT NULL,

  frame_count INTEGER NOT NULL,
  session_elapsed_ms INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX mood_observations_user_id_idx ON mood_observations(user_id);
CREATE INDEX mood_observations_created_at_idx ON mood_observations(created_at);
