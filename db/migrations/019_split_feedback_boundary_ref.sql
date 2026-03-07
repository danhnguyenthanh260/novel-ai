BEGIN;

ALTER TABLE public.split_feedback
  ADD COLUMN IF NOT EXISTS boundary_scene_idx_left integer NULL,
  ADD COLUMN IF NOT EXISTS boundary_scene_idx_right integer NULL,
  ADD COLUMN IF NOT EXISTS boundary_char_offset integer NULL;

CREATE INDEX IF NOT EXISTS split_feedback_boundary_ref_idx
  ON public.split_feedback(story_id, chapter_id, boundary_scene_idx_left, boundary_scene_idx_right, created_at DESC);

COMMIT;
