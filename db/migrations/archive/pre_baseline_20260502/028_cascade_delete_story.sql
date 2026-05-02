BEGIN;

-- Update foreign keys to CASCADE ON DELETE for story_series
-- This allows deleting a story to automatically clean up all related data

-- 1. narrative_scene
ALTER TABLE public.narrative_scene
  DROP CONSTRAINT IF EXISTS narrative_scene_story_id_fkey,
  ADD CONSTRAINT narrative_scene_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

-- 2. timeline_event
ALTER TABLE public.timeline_event
  DROP CONSTRAINT IF EXISTS timeline_event_story_id_fkey,
  ADD CONSTRAINT timeline_event_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

-- 3. narrative_pipeline_run
ALTER TABLE public.narrative_pipeline_run
  DROP CONSTRAINT IF EXISTS narrative_pipeline_run_story_id_fkey,
  ADD CONSTRAINT narrative_pipeline_run_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

-- 4. source_doc (if applicable, let's check its schema)
-- Assuming source_doc has story_id and was created with RESTRICT or default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute 
    WHERE attrelid = 'public.source_doc'::regclass AND attname = 'story_id'
  ) THEN
    ALTER TABLE public.source_doc
      DROP CONSTRAINT IF EXISTS source_doc_story_id_fkey,
      ADD CONSTRAINT source_doc_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
