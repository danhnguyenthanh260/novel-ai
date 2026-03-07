BEGIN;

CREATE TABLE IF NOT EXISTS public.split_strategy_profile (
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NOT NULL,
  profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS split_strategy_profile_updated_at_idx
  ON public.split_strategy_profile(updated_at DESC);

COMMIT;

