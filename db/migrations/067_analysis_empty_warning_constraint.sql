BEGIN;

ALTER TABLE public.writing_analysis_staging
  DROP CONSTRAINT IF EXISTS writing_analysis_staging_status_check;

ALTER TABLE public.writing_analysis_staging
  ADD CONSTRAINT writing_analysis_staging_status_check
  CHECK (status IN ('STAGED', 'VETTED', 'INTEGRATED', 'UNVETTED', 'EMPTY_WARNING'));

ALTER TABLE public.writing_snapshot_v3
  DROP CONSTRAINT IF EXISTS writing_snapshot_v3_fact_status_check;

ALTER TABLE public.writing_snapshot_v3
  ADD CONSTRAINT writing_snapshot_v3_fact_status_check
  CHECK (fact_status IN ('CLEAN', 'CONFLICT', 'UNVETTED', 'EMPTY_WARNING', 'INCOMPLETE_COVERAGE'));

COMMIT;

