BEGIN;

CREATE TABLE IF NOT EXISTS public.story_series (
  id                       bigserial PRIMARY KEY,
  slug                     text NOT NULL UNIQUE,
  title                    text NOT NULL,
  status                   text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','DRAFT')),
  system_prompt            text,
  tone_profile_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_llm_params_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamp without time zone NOT NULL DEFAULT now(),
  updated_at               timestamp without time zone NOT NULL DEFAULT now()
);

INSERT INTO public.story_series(slug, title, status)
VALUES ('default', 'Default Story', 'ACTIVE')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.narrative_scene
  ADD COLUMN IF NOT EXISTS story_id bigint,
  ADD COLUMN IF NOT EXISTS workunit_id text;

UPDATE public.narrative_scene s
SET story_id = ss.id
FROM public.story_series ss
WHERE ss.slug = 'default'
  AND s.story_id IS NULL;

UPDATE public.narrative_scene
SET workunit_id =
  COALESCE(NULLIF(chapter_id::text, ''), 'ch00') || '_s' || LPAD(COALESCE(idx, 0)::text, 2, '0')
WHERE workunit_id IS NULL;

WITH ranked AS (
  SELECT
    id,
    story_id,
    workunit_id,
    ROW_NUMBER() OVER (PARTITION BY story_id, workunit_id ORDER BY id) AS rn
  FROM public.narrative_scene
)
UPDATE public.narrative_scene s
SET workunit_id = s.workunit_id || '__dup' || ranked.rn::text
FROM ranked
WHERE ranked.id = s.id
  AND ranked.rn > 1;

ALTER TABLE public.narrative_scene
  ALTER COLUMN story_id SET NOT NULL,
  ALTER COLUMN workunit_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'narrative_scene_story_id_fkey'
  ) THEN
    ALTER TABLE public.narrative_scene
      ADD CONSTRAINT narrative_scene_story_id_fkey
      FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scene_story_chapter_idx
  ON public.narrative_scene(story_id, chapter_id, idx);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scene_story_workunit
  ON public.narrative_scene(story_id, workunit_id);

ALTER TABLE public.timeline_event
  ADD COLUMN IF NOT EXISTS story_id bigint;

UPDATE public.timeline_event t
SET story_id = ss.id
FROM public.story_series ss
WHERE ss.slug = 'default'
  AND t.story_id IS NULL;

ALTER TABLE public.timeline_event
  ALTER COLUMN story_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'timeline_event_story_id_fkey'
  ) THEN
    ALTER TABLE public.timeline_event
      ADD CONSTRAINT timeline_event_story_id_fkey
      FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_timeline_story_start_ts
  ON public.timeline_event(story_id, start_ts);

ALTER TABLE public.narrative_pipeline_run
  ADD COLUMN IF NOT EXISTS story_id bigint;

UPDATE public.narrative_pipeline_run r
SET story_id = s.story_id
FROM public.narrative_scene s
WHERE r.scene_id IS NOT NULL
  AND s.id = r.scene_id
  AND r.story_id IS NULL;

UPDATE public.narrative_pipeline_run r
SET story_id = ss.id
FROM public.story_series ss
WHERE ss.slug = 'default'
  AND r.story_id IS NULL;

ALTER TABLE public.narrative_pipeline_run
  ALTER COLUMN story_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'narrative_pipeline_run_story_id_fkey'
  ) THEN
    ALTER TABLE public.narrative_pipeline_run
      ADD CONSTRAINT narrative_pipeline_run_story_id_fkey
      FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pipeline_run_story_step_time
  ON public.narrative_pipeline_run(story_id, step, created_at DESC);

DROP VIEW IF EXISTS public.narrative_scene_latest;

CREATE VIEW public.narrative_scene_latest AS
SELECT
  s.id,
  s.story_id,
  s.workunit_id,
  s.chapter_id,
  s.idx,
  s.title,
  s.status,
  s.current_version_id,
  v.kind         AS current_kind,
  v.version_no   AS current_version_no,
  v.text_content AS current_text,
  v.beats_json   AS current_beats,
  v.eval_json    AS current_eval,
  s.created_at,
  s.updated_at
FROM public.narrative_scene s
LEFT JOIN public.narrative_scene_version v
  ON v.id = s.current_version_id;

COMMIT;
