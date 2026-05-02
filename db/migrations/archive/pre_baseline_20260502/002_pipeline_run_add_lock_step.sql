BEGIN;

ALTER TABLE public.narrative_pipeline_run
  DROP CONSTRAINT IF EXISTS narrative_pipeline_run_step_check;

ALTER TABLE public.narrative_pipeline_run
  ADD CONSTRAINT narrative_pipeline_run_step_check
  CHECK (step IN ('intake','outline','draft','evaluate','rewrite','lock'));

COMMIT;
