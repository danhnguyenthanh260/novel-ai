BEGIN;

ALTER TABLE public.split_feedback
  ADD COLUMN IF NOT EXISTS feedback_quality_score numeric(4,3) NULL;

UPDATE public.split_feedback
SET feedback_quality_score = COALESCE(feedback_quality_score, 0.500)
WHERE feedback_quality_score IS NULL;

ALTER TABLE public.split_feedback
  ALTER COLUMN feedback_quality_score SET DEFAULT 0.500;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'split_feedback_quality_score_check'
  ) THEN
    ALTER TABLE public.split_feedback
      ADD CONSTRAINT split_feedback_quality_score_check
      CHECK (
        feedback_quality_score IS NULL
        OR (feedback_quality_score >= 0.000 AND feedback_quality_score <= 1.000)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS split_feedback_quality_score_idx
  ON public.split_feedback(story_id, chapter_id, feedback_quality_score, created_at DESC);

COMMIT;
