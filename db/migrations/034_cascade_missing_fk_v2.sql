BEGIN;

-- Part 6 of Cascade Delete Master
-- Handling the last batch of forgotten tables linking to story_series via RESTRICT:
-- review_request, story_worldbuilding_note, story_style_profile, muse_rules, muse_snapshots

-- 1. review_request
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='review_request' AND column_name='story_id') THEN
    ALTER TABLE public.review_request DROP CONSTRAINT IF EXISTS review_request_story_id_fkey, ADD CONSTRAINT review_request_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. story_worldbuilding_note
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='story_worldbuilding_note' AND column_name='story_id') THEN
    ALTER TABLE public.story_worldbuilding_note DROP CONSTRAINT IF EXISTS story_worldbuilding_note_story_id_fkey, ADD CONSTRAINT story_worldbuilding_note_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. story_style_profile
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='story_style_profile' AND column_name='story_id') THEN
    ALTER TABLE public.story_style_profile DROP CONSTRAINT IF EXISTS story_style_profile_story_id_fkey, ADD CONSTRAINT story_style_profile_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. muse_rules
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='muse_rules' AND column_name='story_id') THEN
    ALTER TABLE public.muse_rules DROP CONSTRAINT IF EXISTS muse_rules_story_id_fkey, ADD CONSTRAINT muse_rules_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. muse_snapshots
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='muse_snapshots' AND column_name='story_id') THEN
    ALTER TABLE public.muse_snapshots DROP CONSTRAINT IF EXISTS muse_snapshots_story_id_fkey, ADD CONSTRAINT muse_snapshots_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
