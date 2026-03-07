BEGIN;

ALTER TABLE public.story_series
  ADD COLUMN IF NOT EXISTS library_status text NOT NULL DEFAULT 'draft'
    CHECK (library_status IN ('draft', 'published', 'archived', 'private')),
  ADD COLUMN IF NOT EXISTS description_md text,
  ADD COLUMN IF NOT EXISTS author_note_md text,
  ADD COLUMN IF NOT EXISTS summary_md text,
  ADD COLUMN IF NOT EXISTS cover_image_path text,
  ADD COLUMN IF NOT EXISTS caution_other_md text;

UPDATE public.story_series
SET library_status = CASE
  WHEN status = 'ACTIVE' THEN 'published'
  WHEN status = 'ARCHIVED' THEN 'archived'
  ELSE 'draft'
END
WHERE library_status IS NULL
   OR library_status NOT IN ('draft', 'published', 'archived', 'private')
   OR (library_status = 'draft' AND status = 'ACTIVE')
   OR (library_status = 'draft' AND status = 'ARCHIVED');

CREATE TABLE IF NOT EXISTS public.story_tag (
  id         bigserial PRIMARY KEY,
  story_id   bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_story_tag_story ON public.story_tag(story_id);
CREATE INDEX IF NOT EXISTS idx_story_tag_tag ON public.story_tag(lower(tag));

CREATE TABLE IF NOT EXISTS public.story_caution (
  id         bigserial PRIMARY KEY,
  story_id   bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  code       text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE (story_id, code)
);

CREATE INDEX IF NOT EXISTS idx_story_caution_story ON public.story_caution(story_id);
CREATE INDEX IF NOT EXISTS idx_story_caution_code ON public.story_caution(lower(code));

CREATE TABLE IF NOT EXISTS public.story_image (
  id         bigserial PRIMARY KEY,
  story_id   bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('cover', 'gallery', 'character', 'scene')),
  path       text NOT NULL,
  caption_md text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_image_story_kind_order
  ON public.story_image(story_id, kind, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_story_image_story_cover
  ON public.story_image(story_id, kind)
  WHERE kind = 'cover';

COMMIT;
