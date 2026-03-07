BEGIN;

ALTER TABLE public.split_feedback
ADD COLUMN IF NOT EXISTS structured_tags jsonb NULL;

COMMIT;
