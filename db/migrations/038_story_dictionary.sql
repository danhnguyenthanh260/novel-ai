BEGIN;

CREATE TABLE IF NOT EXISTS public.story_dictionary (
  id                  bigserial PRIMARY KEY,
  story_id            bigint REFERENCES public.story_series(id) ON DELETE CASCADE,
  tier                text NOT NULL CHECK (tier IN ('technical', 'narrative', 'style')),
  term_key            text NOT NULL,
  definition          text NOT NULL,
  agent_instructions  text NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_dict_story_id ON public.story_dictionary(story_id);
CREATE INDEX IF NOT EXISTS idx_story_dict_tier ON public.story_dictionary(tier);
CREATE INDEX IF NOT EXISTS idx_story_dict_term_key ON public.story_dictionary(term_key);

COMMIT;
