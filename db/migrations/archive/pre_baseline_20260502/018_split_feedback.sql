BEGIN;

CREATE TABLE IF NOT EXISTS public.split_feedback (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  job_id bigint NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  chapter_task_id bigint NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  chapter_id text NOT NULL,
  strategy text NULL,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  issue_code text NULL,
  note text NULL,
  created_by text NOT NULL DEFAULT 'ui',
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS split_feedback_story_chapter_created_idx
  ON public.split_feedback(story_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS split_feedback_strategy_created_idx
  ON public.split_feedback(story_id, chapter_id, strategy, created_at DESC);

COMMIT;

