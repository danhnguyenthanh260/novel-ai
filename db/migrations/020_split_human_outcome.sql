BEGIN;

ALTER TABLE public.ingest_task
  ADD COLUMN IF NOT EXISTS human_outcome text NULL,
  ADD COLUMN IF NOT EXISTS human_verdict_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS human_verdict_by text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ingest_task_human_outcome_check'
  ) THEN
    ALTER TABLE public.ingest_task
      ADD CONSTRAINT ingest_task_human_outcome_check
      CHECK (
        human_outcome IS NULL
        OR human_outcome IN (
          'AWAIT_APPROVAL',
          'APPROVED_HUMAN',
          'FAILED_HUMAN_REJECTED',
          'FAILED_QUALITY'
        )
      );
  END IF;
END $$;

UPDATE public.ingest_task
SET
  human_outcome = NULLIF(result_json->>'human_outcome', ''),
  human_verdict_by = COALESCE(NULLIF(result_json->>'human_verdict_by', ''), human_verdict_by),
  human_verdict_at = COALESCE(
    NULLIF(result_json->>'human_verdict_at', '')::timestamptz,
    human_verdict_at
  )
WHERE task_type = 'CHAPTER_SPLIT_LLM'
  AND (
    human_outcome IS NULL
    OR human_verdict_by IS NULL
    OR human_verdict_at IS NULL
  );

CREATE INDEX IF NOT EXISTS ingest_task_split_human_outcome_idx
  ON public.ingest_task (story_id, task_type, status, human_outcome, updated_at DESC);

COMMIT;
