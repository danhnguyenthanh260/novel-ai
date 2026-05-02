BEGIN;

-- Master Cascade Delete for story_series
-- Ensure all related child tables have ON DELETE CASCADE so that story deletion succeeds

-- From 010_shelf_library_foundation.sql
ALTER TABLE IF EXISTS public.story_tag
  DROP CONSTRAINT IF EXISTS story_tag_story_id_fkey,
  ADD CONSTRAINT story_tag_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.story_caution
  DROP CONSTRAINT IF EXISTS story_caution_story_id_fkey,
  ADD CONSTRAINT story_caution_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.story_image
  DROP CONSTRAINT IF EXISTS story_image_story_id_fkey,
  ADD CONSTRAINT story_image_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

-- From 025_scene_state_snapshots.sql
ALTER TABLE IF EXISTS public.narrative_scene_state
  DROP CONSTRAINT IF EXISTS narrative_scene_state_story_id_fkey,
  ADD CONSTRAINT narrative_scene_state_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

-- From 013_muse_analysis.sql (originally ON DELETE RESTRICT)
ALTER TABLE IF EXISTS public.muse_analysis
  DROP CONSTRAINT IF EXISTS muse_analysis_story_id_fkey,
  ADD CONSTRAINT muse_analysis_story_id_fkey
    FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;

-- Review / Split schemas (006, 017, 020)
-- 020_split_human_outcome.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'split_human_outcome' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.split_human_outcome
      DROP CONSTRAINT IF EXISTS split_human_outcome_story_id_fkey,
      ADD CONSTRAINT split_human_outcome_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 017_split_strategy_profile.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'split_strategy_profile' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.split_strategy_profile
      DROP CONSTRAINT IF EXISTS split_strategy_profile_story_id_fkey,
      ADD CONSTRAINT split_strategy_profile_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
