BEGIN;

CREATE TABLE IF NOT EXISTS public.author_style_profile (
  story_id      bigint PRIMARY KEY REFERENCES public.story_series(id) ON DELETE RESTRICT,
  profile_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.author_style_profile_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_author_style_profile_updated_at ON public.author_style_profile;
CREATE TRIGGER trg_author_style_profile_updated_at
BEFORE UPDATE ON public.author_style_profile
FOR EACH ROW EXECUTE FUNCTION public.author_style_profile_touch_updated_at();

CREATE INDEX IF NOT EXISTS author_style_profile_updated_at_idx
  ON public.author_style_profile(updated_at DESC);

COMMIT;
