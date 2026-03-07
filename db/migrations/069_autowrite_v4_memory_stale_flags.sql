BEGIN;

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS stale_reason text NULL;

CREATE INDEX IF NOT EXISTS story_milestone_story_stale_chapter_to_idx
  ON public.story_milestone(story_id, is_stale, chapter_to DESC, updated_at DESC);

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS stale_reason text NULL;

CREATE INDEX IF NOT EXISTS writing_scope_snapshot_v1_story_scope_stale_idx
  ON public.writing_scope_snapshot_v1(story_id, scope_type, is_stale, created_at DESC);

COMMIT;
