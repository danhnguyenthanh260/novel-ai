BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_janitor_task (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  job_id bigint NOT NULL REFERENCES public.ingest_job(id) ON DELETE CASCADE,
  chapter_id text NULL,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'RUNNING', 'DONE', 'FAILED')),
  retry_count int NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_janitor_task_job
  ON public.agent_janitor_task(job_id);

CREATE INDEX IF NOT EXISTS idx_agent_janitor_task_poll
  ON public.agent_janitor_task(status, available_at, id);

COMMIT;
