BEGIN;

ALTER TABLE public.review_apply_log
  ADD COLUMN IF NOT EXISTS response_id bigint,
  ADD COLUMN IF NOT EXISTS human_overall numeric(4,2),
  ADD COLUMN IF NOT EXISTS ai_overall numeric(4,2),
  ADD COLUMN IF NOT EXISTS fused_overall numeric(4,2),
  ADD COLUMN IF NOT EXISTS decision text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'review_apply_log_response_id_fkey'
  ) THEN
    ALTER TABLE public.review_apply_log
      ADD CONSTRAINT review_apply_log_response_id_fkey
      FOREIGN KEY (response_id) REFERENCES public.review_response(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.review_apply_log
  DROP CONSTRAINT IF EXISTS review_apply_log_decision_check;

ALTER TABLE public.review_apply_log
  ADD CONSTRAINT review_apply_log_decision_check
  CHECK (decision IS NULL OR decision IN ('LOCK','REWRITE'));

CREATE INDEX IF NOT EXISTS idx_review_apply_log_response
  ON public.review_apply_log(response_id);

COMMIT;
