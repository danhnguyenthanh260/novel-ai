-- Add scheduling support for memory enrich tasks
ALTER TABLE public.memory_enrich_task ADD COLUMN IF NOT EXISTS available_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Ensure all pending/ready tasks have a valid available_at
UPDATE public.memory_enrich_task SET available_at = NOW() WHERE available_at IS NULL;
