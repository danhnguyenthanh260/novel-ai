BEGIN;

ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS visual_profile_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

