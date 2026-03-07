BEGIN;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS degraded_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS completeness_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS ready_for_writing boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS writing_snapshot_v3_ready_idx
  ON public.writing_snapshot_v3(story_id, chapter_id, ready_for_writing, created_at DESC);

CREATE TABLE IF NOT EXISTS public.story_active_analysis_snapshot (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NOT NULL,
  snapshot_id bigint NOT NULL REFERENCES public.writing_snapshot_v3(id) ON DELETE CASCADE,
  activated_by text NOT NULL DEFAULT 'system',
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS story_active_analysis_snapshot_story_idx
  ON public.story_active_analysis_snapshot(story_id, chapter_id, updated_at DESC);

COMMIT;
