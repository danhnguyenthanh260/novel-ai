BEGIN;

ALTER TABLE public.ingest_job
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid,
  ADD COLUMN IF NOT EXISTS split_draft_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  status_attnum smallint;
  rec record;
BEGIN
  SELECT attnum INTO status_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ingest_job'::regclass
    AND attname = 'status'
    AND NOT attisdropped;

  IF status_attnum IS NOT NULL THEN
    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.ingest_job'::regclass
        AND c.contype = 'c'
        AND c.conkey = ARRAY[status_attnum]
    LOOP
      EXECUTE format('ALTER TABLE public.ingest_job DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.ingest_job
  ADD CONSTRAINT ingest_job_status_check
  CHECK (
    status IN (
      'PENDING',
      'RUNNING',
      'DONE',
      'FAILED',
      'CANCELLED',
      'SPLIT_DRAFT',
      'AWAIT_APPROVAL',
      'APPROVED',
      'REJECTED'
    )
  );

CREATE INDEX IF NOT EXISTS idx_ingest_job_story_run
  ON public.ingest_job(story_id, ingest_run_id, created_at DESC);

ALTER TABLE public.ingest_task
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS depends_on_task_id bigint,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS result_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ingest_task_depends_on_task_id_fkey'
  ) THEN
    ALTER TABLE public.ingest_task
      ADD CONSTRAINT ingest_task_depends_on_task_id_fkey
      FOREIGN KEY (depends_on_task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.ingest_task
SET task_type =
  CASE
    WHEN unit_type = 'chapter' THEN 'LEGACY_CHAPTER_PARSE'
    WHEN unit_type = 'scene' THEN 'LEGACY_SCENE_INDEX'
    ELSE 'LEGACY'
  END
WHERE task_type = 'LEGACY';

DO $$
DECLARE
  unit_type_attnum smallint;
  status_attnum smallint;
  rec record;
BEGIN
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

  SELECT attnum INTO status_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ingest_task'::regclass
    AND attname = 'status'
    AND NOT attisdropped;

  IF status_attnum IS NOT NULL THEN
    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.ingest_task'::regclass
        AND c.contype = 'c'
        AND c.conkey = ARRAY[status_attnum]
    LOOP
      EXECUTE format('ALTER TABLE public.ingest_task DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.ingest_task
  ADD CONSTRAINT ingest_task_unit_type_check
  CHECK (unit_type IN ('chapter', 'scene', 'split_draft'));

ALTER TABLE public.ingest_task
  ADD CONSTRAINT ingest_task_status_check
  CHECK (status IN ('PENDING', 'READY', 'RUNNING', 'WAIT_REVIEW', 'DONE', 'FAILED'));

ALTER TABLE public.ingest_task
  ADD CONSTRAINT ingest_task_task_type_check
  CHECK (
    task_type IN (
      'LEGACY',
      'LEGACY_CHAPTER_PARSE',
      'LEGACY_SCENE_INDEX',
      'CHAPTER_SPLIT_LLM',
      'SCENE_CREATE'
    )
  );

CREATE INDEX IF NOT EXISTS idx_ingest_task_depends
  ON public.ingest_task(depends_on_task_id)
  WHERE depends_on_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingest_task_story_type_status
  ON public.ingest_task(story_id, task_type, status, seq_no ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ingest_task_story_type_idempotency
  ON public.ingest_task(story_id, task_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

ALTER TABLE public.narrative_scene
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid;

ALTER TABLE public.narrative_scene_version
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid;

CREATE INDEX IF NOT EXISTS idx_narrative_scene_story_ingest_run
  ON public.narrative_scene(story_id, ingest_run_id)
  WHERE ingest_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scene_version_story_ingest_run
  ON public.narrative_scene_version(story_id, ingest_run_id)
  WHERE ingest_run_id IS NOT NULL;

COMMIT;
