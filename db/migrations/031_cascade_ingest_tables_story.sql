BEGIN;

-- Part 3 of Cascade Delete Master
-- Handling ingest_job, ingest_task (though ingest_task doesn't reference story_series directly via FK, it's safer to check), and review_apply_log

-- Check ingest_job
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'ingest_job' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.ingest_job
      DROP CONSTRAINT IF EXISTS ingest_job_story_id_fkey,
      ADD CONSTRAINT ingest_job_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Check review_apply_log
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'review_apply_log' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.review_apply_log
      DROP CONSTRAINT IF EXISTS review_apply_log_story_id_fkey,
      ADD CONSTRAINT review_apply_log_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
