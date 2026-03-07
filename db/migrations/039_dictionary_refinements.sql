BEGIN;

-- Phase 7 Refinements: Priority, Scope, and Aliases
ALTER TABLE public.story_dictionary ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 5;
ALTER TABLE public.story_dictionary ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'local' CHECK (scope IN ('local', 'global'));
ALTER TABLE public.story_dictionary ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '[]';

-- Phase 8 Refinements: Lifecycle Pruning
ALTER TABLE public.story_dictionary ADD COLUMN IF NOT EXISTS valid_from_chapter integer NULL;
ALTER TABLE public.story_dictionary ADD COLUMN IF NOT EXISTS valid_to_chapter integer NULL;

-- Index for aliases (using GIN for JSONB containment)
CREATE INDEX IF NOT EXISTS idx_story_dict_aliases ON public.story_dictionary USING gin (aliases);

COMMIT;
