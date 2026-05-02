BEGIN;

-- Part 5 of Cascade Delete Master
-- Handling story_canon_fact and author_style_profile based on pg_constraint exact query

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'story_canon_fact' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.story_canon_fact
      DROP CONSTRAINT IF EXISTS story_canon_fact_story_id_fkey,
      ADD CONSTRAINT story_canon_fact_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'author_style_profile' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.author_style_profile
      DROP CONSTRAINT IF EXISTS author_style_profile_story_id_fkey,
      ADD CONSTRAINT author_style_profile_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
