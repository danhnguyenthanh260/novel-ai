BEGIN;

CREATE TABLE IF NOT EXISTS public.story_chapter (
  id          bigserial PRIMARY KEY,
  story_id    bigint NOT NULL,
  chapter_id  text NOT NULL,
  title       text,
  summary     text,
  created_at  timestamp without time zone NOT NULL DEFAULT now(),
  updated_at  timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_story_chapter_id UNIQUE(story_id, chapter_id),
  CONSTRAINT story_chapter_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_chapter_story_id ON public.story_chapter(story_id);

COMMIT;
