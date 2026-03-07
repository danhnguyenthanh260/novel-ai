-- Pipeline Node Visibility Foundation (Phase 1)

CREATE TABLE IF NOT EXISTS public.pipeline_node_event (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  job_id bigint NOT NULL REFERENCES public.ingest_job(id) ON DELETE CASCADE,
  task_id bigint NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  flow_type text NOT NULL CHECK (flow_type IN ('INGEST_SPLIT', 'REPROCESS_SPLIT', 'AUTOWRITE')),
  node_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'READY', 'RUNNING', 'WAIT_REVIEW', 'DONE', 'FAILED', 'BLOCKED', 'SKIPPED')),
  message text NULL,
  error_code text NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_node_event_story_job_created_idx
  ON public.pipeline_node_event(story_id, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_node_event_job_node_created_idx
  ON public.pipeline_node_event(job_id, node_key, created_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_node_event_status_created_idx
  ON public.pipeline_node_event(status, created_at DESC);
