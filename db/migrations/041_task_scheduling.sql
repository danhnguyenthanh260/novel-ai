-- Migration: Task Scheduling & Cool-off support
BEGIN;

ALTER TABLE public.ingest_task
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.ingest_job
  ADD COLUMN IF NOT EXISTS cool_off_seconds INTEGER DEFAULT 60;

COMMIT;
