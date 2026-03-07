BEGIN;

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS classification text;

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS is_static boolean;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'canon_fact_classification_check'
      AND conrelid = 'public.canon_fact'::regclass
  ) THEN
    ALTER TABLE public.canon_fact
      ADD CONSTRAINT canon_fact_classification_check
      CHECK (classification IS NULL OR classification IN ('STATIC', 'EPHEMERAL', 'META'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.story_milestone (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  arc_id bigint NULL REFERENCES public.story_arc(id) ON DELETE SET NULL,
  chapter_from text NOT NULL,
  chapter_to text NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text NULL,
  quality_score numeric(6,4) NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_milestone_story_chapter_to_idx
  ON public.story_milestone(story_id, chapter_to DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS story_milestone_story_arc_range_idx
  ON public.story_milestone(story_id, arc_id, chapter_from, chapter_to);

CREATE UNIQUE INDEX IF NOT EXISTS story_milestone_story_range_source_hash_uniq
  ON public.story_milestone(story_id, chapter_from, chapter_to, source_hash)
  WHERE source_hash IS NOT NULL AND source_hash <> '';

DO $$
DECLARE
  task_type_attnum smallint;
  unit_type_attnum smallint;
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
      'NARRATIVE_START',
      'NARRATIVE_STYLIST',
      'NARRATIVE_CRITIC',
      'NARRATIVE_REFINE',
      'NARRATIVE_FINALIZE'
    )
  );

ALTER TABLE public.ingest_task
  ADD CONSTRAINT ingest_task_unit_type_check
  CHECK (
    unit_type IN (
      'chapter',
      'scene',
      'split_draft',
      'profile_correction',
      'chapter_validate',
      'chapter_ingest',
      'writing_analysis',
      'memory_rollup',
      'writing_planning',
      'writing_prose',
      'writing_continuity',
      'writing_supervisor'
    )
  );

COMMIT;
