CREATE TABLE IF NOT EXISTS public.entity_truth_overlay (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  entity_key TEXT NOT NULL,
  canonical_type TEXT NOT NULL,
  canonical_role TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  source_of_truth TEXT NOT NULL DEFAULT 'HUMAN_REVIEW',
  reviewed_by TEXT NULL,
  review_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_truth_overlay_story_entity
  ON public.entity_truth_overlay (story_id, entity_key);

CREATE INDEX IF NOT EXISTS idx_entity_truth_overlay_story_role
  ON public.entity_truth_overlay (story_id, canonical_role, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.entity_conflict_review (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NULL,
  entity_key TEXT NOT NULL,
  candidate_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  authority_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  conflict_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  suggested_resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'REQUIRES_HUMAN_REVIEW',
  resolution_action TEXT NULL,
  resolution_payload JSONB NULL,
  actor TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_conflict_review_story_status
  ON public.entity_conflict_review (story_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_conflict_review_story_entity
  ON public.entity_conflict_review (story_id, entity_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.entity_conflict_review_event (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  review_id BIGINT NOT NULL REFERENCES public.entity_conflict_review(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_conflict_review_event_story_review
  ON public.entity_conflict_review_event (story_id, review_id, created_at DESC);

