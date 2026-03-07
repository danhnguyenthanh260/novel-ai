-- Expand allowed modes for ingest_job
ALTER TABLE public.ingest_job DROP CONSTRAINT IF EXISTS ingest_job_mode_check;
ALTER TABLE public.ingest_job ADD CONSTRAINT ingest_job_mode_check CHECK (mode IN ('AUTO_LOCK', 'REVIEW_GATE', 'AUTO_CHAPTER'));
