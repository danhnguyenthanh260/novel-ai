BEGIN;

CREATE TABLE IF NOT EXISTS public.writing_analysis_staging (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  job_id bigint NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  task_id bigint NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  chapter_id text NULL,
  source_hash text NULL,
  candidate_facts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative_metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  vetting_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'STAGED'
    CHECK (status IN ('STAGED', 'VETTED', 'INTEGRATED', 'UNVETTED')),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS writing_analysis_staging_story_task_uniq
  ON public.writing_analysis_staging(story_id, task_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS writing_analysis_staging_story_chapter_idx
  ON public.writing_analysis_staging(story_id, chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.writing_snapshot_v3 (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  job_id bigint NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  task_id bigint NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  chapter_id text NULL,
  fact_status text NOT NULL DEFAULT 'UNVETTED'
    CHECK (fact_status IN ('CLEAN', 'CONFLICT', 'UNVETTED')),
  narrative_score numeric(6,4) NOT NULL DEFAULT 0,
  emotional_target text NULL,
  open_loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  lore_debt boolean NOT NULL DEFAULT false,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS writing_snapshot_v3_story_chapter_idx
  ON public.writing_snapshot_v3(story_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS writing_snapshot_v3_story_job_idx
  ON public.writing_snapshot_v3(story_id, job_id, created_at DESC);

COMMIT;
