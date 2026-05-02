BEGIN;

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS stale_reason text NULL;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS stale_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_story_milestone_story_stale_updated
  ON public.story_milestone(story_id, is_stale, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_scope_snapshot_story_scope_stale_updated
  ON public.writing_scope_snapshot_v1(story_id, scope_type, is_stale, updated_at DESC);

COMMIT;
