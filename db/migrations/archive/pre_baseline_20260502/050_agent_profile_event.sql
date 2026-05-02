BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_profile_event (
  id bigserial PRIMARY KEY,
  agent_profile_id bigint NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  story_id bigint NULL REFERENCES public.story_series(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('CREATE_PROFILE', 'SEAL', 'UNSEAL', 'XP_RECALC', 'SLOT_ATTACH', 'SLOT_REPLACE')),
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT 'studio',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_profile_event_profile_created
  ON public.agent_profile_event(agent_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_profile_event_story_created
  ON public.agent_profile_event(story_id, created_at DESC);

COMMIT;
