BEGIN;

CREATE TABLE IF NOT EXISTS public.story_quality_policy (
  story_id bigint PRIMARY KEY REFERENCES public.story_series(id) ON DELETE CASCADE,
  golden_chapter_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  golden_min_runs int NOT NULL DEFAULT 5 CHECK (golden_min_runs >= 1 AND golden_min_runs <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_quality_policy_updated_at
  ON public.story_quality_policy(updated_at DESC);

COMMIT;
