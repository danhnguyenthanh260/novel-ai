BEGIN;

ALTER TABLE public.narrative_scene
  DROP CONSTRAINT IF EXISTS narrative_scene_chapter_id_idx_key;

DROP INDEX IF EXISTS public.narrative_scene_chapter_id_idx_key;
DROP INDEX IF EXISTS public.idx_scene_story_chapter_idx;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scene_story_chapter_idx
  ON public.narrative_scene(story_id, chapter_id, idx);

COMMIT;
