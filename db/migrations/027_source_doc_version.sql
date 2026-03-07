BEGIN;

-- Add version column to source_doc
ALTER TABLE public.source_doc
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Update existing records if needed (though usually new records will handle this)
-- For now, default 1 is fine.

COMMIT;
