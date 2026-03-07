BEGIN;

-- Add hygiene flags to Chapters (source_doc)
ALTER TABLE public.source_doc
  ADD COLUMN IF NOT EXISTS is_stable boolean NOT NULL DEFAULT false;

-- Add verification flag to Scenes
ALTER TABLE public.narrative_scene
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Add stale flag and validation errors to Continuity Snapshots
ALTER TABLE public.narrative_scene_state
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_source_doc_stable ON public.source_doc(story_id, is_stable);
CREATE INDEX IF NOT EXISTS idx_narrative_scene_verified ON public.narrative_scene(story_id, is_verified);

COMMIT;
