BEGIN;

CREATE TABLE IF NOT EXISTS public.supervisor_memory (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  job_id bigint NULL,
  chapter_task_id bigint NOT NULL,
  chapter_id text NULL,
  label text NOT NULL,
  source_type text NULL,
  source_role text NULL,
  strategy_selected text NULL,
  supervisor_decision text NULL,
  human_outcome text NULL,
  quality_self_signal numeric(5,4) NULL,
  is_reprocess boolean NOT NULL DEFAULT false,
  signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisor_memory_label_check CHECK (
    label IN ('SUCCESS_NO_REPROCESS', 'SUCCESS_AFTER_REPROCESS', 'FAILED_PATTERN')
  ),
  CONSTRAINT supervisor_memory_quality_self_signal_check CHECK (
    quality_self_signal IS NULL
    OR (quality_self_signal >= 0.0000 AND quality_self_signal <= 1.0000)
  ),
  CONSTRAINT supervisor_memory_story_task_unique UNIQUE (story_id, chapter_task_id)
);

CREATE INDEX IF NOT EXISTS supervisor_memory_story_label_idx
  ON public.supervisor_memory (story_id, label, created_at DESC);

CREATE INDEX IF NOT EXISTS supervisor_memory_story_chapter_idx
  ON public.supervisor_memory (story_id, chapter_id, created_at DESC);

COMMIT;
