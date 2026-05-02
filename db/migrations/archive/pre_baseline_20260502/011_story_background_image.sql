BEGIN;

ALTER TABLE public.story_series
  ADD COLUMN IF NOT EXISTS background_image_path text;

COMMIT;
