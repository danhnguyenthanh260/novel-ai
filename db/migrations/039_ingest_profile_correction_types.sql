BEGIN;

DO $$
DECLARE
  unit_type_attnum smallint;
  task_type_attnum smallint;
  rec record;
BEGIN
  -- unit_type
  SELECT attnum INTO unit_type_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ingest_task'::regclass
    AND attname = 'unit_type'
    AND NOT attisdropped;

  IF unit_type_attnum IS NOT NULL THEN
    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.ingest_task'::regclass
        AND c.contype = 'c'
        AND c.conkey = ARRAY[unit_type_attnum]
    LOOP
      EXECUTE format('ALTER TABLE public.ingest_task DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
  END IF;

  -- task_type
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
  ADD CONSTRAINT ingest_task_unit_type_check
  CHECK (unit_type IN ('chapter', 'scene', 'split_draft', 'profile_correction', 'chapter_validate', 'writing_analysis', 'writing_planning', 'writing_prose', 'writing_continuity', 'writing_supervisor'));

ALTER TABLE public.ingest_task
  ADD CONSTRAINT ingest_task_task_type_check
  CHECK (
    task_type IN (
      'LEGACY',
      'LEGACY_CHAPTER_PARSE',
      'LEGACY_SCENE_INDEX',
      'CHAPTER_SPLIT_LLM',
      'SCENE_CREATE',
      'SPLIT_PROFILE_CORRECTION',
      'CHAPTER_VALIDATE',
      'WRITING_ANALYSIS',
      'WRITING_PLANNING',
      'WRITING_PROSE',
      'WRITING_CONTINUITY',
      'WRITING_SUPERVISOR'
    )
  );

COMMIT;
