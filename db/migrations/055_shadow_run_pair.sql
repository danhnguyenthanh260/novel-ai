CREATE TABLE IF NOT EXISTS public.shadow_run_pair (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NULL,
  job_id BIGINT NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  task_id BIGINT NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL DEFAULT 'SPLITTER',
  active_run_trace_id BIGINT NULL REFERENCES public.agent_run_trace(id) ON DELETE SET NULL,
  shadow_run_trace_id BIGINT NULL REFERENCES public.agent_run_trace(id) ON DELETE SET NULL,
  context_snapshot_id BIGINT NULL REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL,
  active_prompt_version_id BIGINT NULL,
  shadow_prompt_version_id BIGINT NULL,
  pair_status TEXT NOT NULL DEFAULT 'PLANNED',
  compare_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_run_pair_story_created
  ON public.shadow_run_pair (story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_run_pair_task
  ON public.shadow_run_pair (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_run_pair_status
  ON public.shadow_run_pair (pair_status, created_at DESC);
