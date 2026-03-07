BEGIN;

CREATE TABLE IF NOT EXISTS public.story_worldbuilding_note (
  id              bigserial PRIMARY KEY,
  story_id        bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  category        text NOT NULL,
  content         text NOT NULL,
  importance      smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  injection_mode  text NOT NULL DEFAULT 'CORE' CHECK (injection_mode IN ('CORE','TAGGED','MANUAL_ONLY')),
  tags            text[] NOT NULL DEFAULT ARRAY[]::text[],
  content_tsv     tsvector,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.story_worldbuilding_note_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.category, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.content, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(array_to_string(NEW.tags, ' '))), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_worldbuilding_note_tsv ON public.story_worldbuilding_note;
CREATE TRIGGER trg_story_worldbuilding_note_tsv
BEFORE INSERT OR UPDATE OF category, content, tags
ON public.story_worldbuilding_note
FOR EACH ROW EXECUTE FUNCTION public.story_worldbuilding_note_tsv_update();

CREATE INDEX IF NOT EXISTS idx_worldbuilding_story_mode_rank
  ON public.story_worldbuilding_note(story_id, injection_mode, importance DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_worldbuilding_story_category
  ON public.story_worldbuilding_note(story_id, category, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_worldbuilding_tsv_gin
  ON public.story_worldbuilding_note USING gin(content_tsv);

CREATE INDEX IF NOT EXISTS idx_worldbuilding_tags_gin
  ON public.story_worldbuilding_note USING gin(tags);

CREATE TABLE IF NOT EXISTS public.story_style_profile (
  story_id              bigint PRIMARY KEY REFERENCES public.story_series(id) ON DELETE RESTRICT,
  tone_baseline         text NOT NULL DEFAULT '',
  darkness_level        smallint NOT NULL DEFAULT 50 CHECK (darkness_level BETWEEN 0 AND 100),
  political_intensity   smallint NOT NULL DEFAULT 50 CHECK (political_intensity BETWEEN 0 AND 100),
  pacing_bias           smallint NOT NULL DEFAULT 50 CHECK (pacing_bias BETWEEN 0 AND 100),
  prose_density         smallint NOT NULL DEFAULT 50 CHECK (prose_density BETWEEN 0 AND 100),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.story_style_profile_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_style_profile_updated_at ON public.story_style_profile;
CREATE TRIGGER trg_story_style_profile_updated_at
BEFORE UPDATE ON public.story_style_profile
FOR EACH ROW EXECUTE FUNCTION public.story_style_profile_touch_updated_at();

COMMIT;
