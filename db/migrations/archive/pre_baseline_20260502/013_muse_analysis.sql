BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.muse_analysis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  scene_id       bigint REFERENCES public.narrative_scene(id) ON DELETE SET NULL,
  raw_content_md text NOT NULL,
  created_by     text NOT NULL DEFAULT 'ui',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_muse_analysis_story_created
  ON public.muse_analysis(story_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_muse_analysis_story_scene_created
  ON public.muse_analysis(story_id, scene_id, created_at DESC, id);

COMMIT;
