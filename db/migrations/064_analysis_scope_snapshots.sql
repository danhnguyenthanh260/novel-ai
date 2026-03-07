BEGIN;

CREATE TABLE IF NOT EXISTS public.writing_scope_snapshot_v1 (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('batch', 'arc', 'story')),
  scope_key text NOT NULL,
  source_snapshot_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  fact_status text NOT NULL DEFAULT 'UNVETTED',
  ready_for_writing boolean NOT NULL DEFAULT false,
  degraded_mode boolean NOT NULL DEFAULT false,
  narrative_score numeric(5,4) NOT NULL DEFAULT 0,
  emotional_target text NULL,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS writing_scope_snapshot_v1_story_scope_idx
  ON public.writing_scope_snapshot_v1(story_id, scope_type, scope_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.story_active_analysis_scope_snapshot (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('batch', 'arc', 'story')),
  scope_key text NOT NULL,
  snapshot_id bigint NOT NULL REFERENCES public.writing_scope_snapshot_v1(id) ON DELETE CASCADE,
  activated_by text NOT NULL DEFAULT 'operator',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, scope_type, scope_key)
);

CREATE INDEX IF NOT EXISTS story_active_analysis_scope_snapshot_story_idx
  ON public.story_active_analysis_scope_snapshot(story_id, scope_type, scope_key, updated_at DESC);

COMMIT;
