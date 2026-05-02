BEGIN;

DO $$
DECLARE
  mode_attnum smallint;
  rec record;
BEGIN
  SELECT attnum INTO mode_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ingest_job'::regclass
    AND attname = 'mode'
    AND NOT attisdropped;

  IF mode_attnum IS NOT NULL THEN
    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.ingest_job'::regclass
        AND c.contype = 'c'
        AND c.conkey = ARRAY[mode_attnum]
    LOOP
      EXECUTE format('ALTER TABLE public.ingest_job DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.ingest_job
  ADD CONSTRAINT ingest_job_mode_check
  CHECK (
    mode IN (
      'AUTO_LOCK',
      'REVIEW_GATE',
      'AUTO_CHAPTER',
      'AUTO_CHAPTER_V3'
    )
  );

DO $$
DECLARE
  task_type_attnum smallint;
  rec record;
BEGIN
  SELECT attnum INTO task_type_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ingest_task'::regclass
    AND attname = 'task_type'
    AND NOT attisdropped;

  IF task_type_attnum IS NOT NULL THEN
    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.ingest_task'::regclass
        AND c.contype = 'c'
        AND c.conkey = ARRAY[task_type_attnum]
    LOOP
      EXECUTE format('ALTER TABLE public.ingest_task DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.ingest_task
  ADD CONSTRAINT ingest_task_task_type_check
  CHECK (
    task_type IN (
      'LEGACY',
      'LEGACY_CHAPTER_PARSE',
      'LEGACY_SCENE_INDEX',
      'CHAPTER_INGEST',
      'CHAPTER_SPLIT_LLM',
      'SCENE_CREATE',
      'SPLIT_PROFILE_CORRECTION',
      'CHAPTER_VALIDATE',
      'WRITING_ANALYSIS',
      'MEMORY_ROLLUP',
      'WRITING_PLANNING',
      'WRITING_PROSE',
      'WRITING_CONTINUITY',
      'WRITING_SUPERVISOR',
      'CHAPTER_WRITE_V3',
      'CHAPTER_LEDGER_EXTRACT',
      'MEMORY_ROLLUP_V3',
      'NARRATIVE_START',
      'NARRATIVE_STYLIST',
      'NARRATIVE_CRITIC',
      'NARRATIVE_REFINE',
      'NARRATIVE_FINALIZE'
    )
  );

COMMIT;
