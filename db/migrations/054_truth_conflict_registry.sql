CREATE TABLE IF NOT EXISTS public.truth_conflict_registry (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NULL,
  agent_name TEXT NOT NULL DEFAULT 'SPLITTER',
  job_id BIGINT NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  task_id BIGINT NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  run_trace_id BIGINT NULL REFERENCES public.agent_run_trace(id) ON DELETE SET NULL,
  context_snapshot_id BIGINT NULL REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL,
  conflict_id TEXT NOT NULL,
  losing_rule_ref TEXT NOT NULL,
  winning_rule_ref TEXT NOT NULL,
  resolution_mode TEXT NOT NULL DEFAULT 'HIERARCHY',
  resolution_reason TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_truth_conflict_registry_story_created
  ON public.truth_conflict_registry (story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_truth_conflict_registry_chapter
  ON public.truth_conflict_registry (story_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_truth_conflict_registry_task
  ON public.truth_conflict_registry (task_id, created_at DESC);
