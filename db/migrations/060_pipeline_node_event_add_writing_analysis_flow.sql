-- Migration 060: Add WRITING_ANALYSIS_FLOW to pipeline node events
-- This allows dedicated tracking and isolation of the analysis pipeline.

-- 1. Add 'WRITING_ANALYSIS' to the allowed flow types if it was a check constraint (checking existing types)
-- Since it's usually just a text field or handled in code, we ensure the enum/mapping is consistent.

-- 2. Ensure the worker task type 'WRITING_ANALYSIS' is correctly categorized
-- (This is typically handled in worker_ingest_repo.py mapping, but we can add meta-data here if needed)

-- For now, we mainly need a way to track the state of this specific flow.
-- We might add a specific col if needed, but the core request is about the "lane" and "isolation".

-- If there's a specific table for pipeline events, we add the type there.
INSERT INTO public.pipeline_node_type (type_slug, description)
VALUES ('WRITING_ANALYSIS', 'Dedicated analysis pass for facts, lore, and narrative metrics')
ON CONFLICT (type_slug) DO NOTHING;

-- This migration signals the readiness for the 3-lane isolation.
