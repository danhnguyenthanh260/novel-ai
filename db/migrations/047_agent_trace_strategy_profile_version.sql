BEGIN;

ALTER TABLE IF EXISTS public.split_strategy_profile
  ADD COLUMN IF NOT EXISTS profile_version bigint NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS public.agent_run_trace
  ADD COLUMN IF NOT EXISTS strategy_profile_version_id bigint NULL;

CREATE INDEX IF NOT EXISTS idx_agent_run_trace_strategy_profile_version_created
  ON public.agent_run_trace(strategy_profile_version_id, created_at DESC);

COMMIT;
