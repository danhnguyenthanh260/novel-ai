BEGIN;

-- Part 4 of Cascade Delete Master
-- Handling ingest_task story_id foreign key constraint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'ingest_task' 
      AND column_name = 'story_id'
  ) THEN
    ALTER TABLE public.ingest_task
      DROP CONSTRAINT IF EXISTS ingest_task_story_id_fkey,
      ADD CONSTRAINT ingest_task_story_id_fkey
        FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
