-- C7 (revised) — Supabase Anonymous Authentication owns identity entirely;
-- this backend never issues a JWT and never stores a password. `id` IS the
-- verified Supabase `sub` (auth.users.id from the Supabase project this
-- deployment points at), not a locally-generated id. This table exists only
-- to give other tables (conversations, mood_observations,
-- camera_consent_events) a foreign-key target with referential integrity.
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() for every OTHER table's own id

CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
