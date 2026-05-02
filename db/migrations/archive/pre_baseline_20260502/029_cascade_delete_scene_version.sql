BEGIN;

-- Update foreign keys to CASCADE ON DELETE for story_series (v2)
-- Adding missing cascade for narrative_scene_version

ALTER TABLE public.narrative_scene_version
  DROP CONSTRAINT IF EXISTS narrative_scene_version_story_id_fkey,
  ADD CONSTRAINT narrative_scene_version_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

COMMIT;
