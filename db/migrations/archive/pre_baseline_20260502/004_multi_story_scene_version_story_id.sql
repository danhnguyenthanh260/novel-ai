BEGIN;

ALTER TABLE public.narrative_scene_version
  ADD COLUMN IF NOT EXISTS story_id bigint;

UPDATE public.narrative_scene_version v
SET story_id = s.story_id
FROM public.narrative_scene s
WHERE s.id = v.scene_id
  AND v.story_id IS NULL;

ALTER TABLE public.narrative_scene_version
  ALTER COLUMN story_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'narrative_scene_version_story_id_fkey'
  ) THEN
    ALTER TABLE public.narrative_scene_version
      ADD CONSTRAINT narrative_scene_version_story_id_fkey
      FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scene_version_story_scene_time
  ON public.narrative_scene_version(story_id, scene_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scene_story_version_no
  ON public.narrative_scene_version(story_id, scene_id, version_no);

COMMIT;
