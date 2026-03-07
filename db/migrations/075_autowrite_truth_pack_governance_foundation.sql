BEGIN;

CREATE TABLE IF NOT EXISTS public.pack_budget_policy_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  policy_version INTEGER NOT NULL DEFAULT 1,
  default_model_class TEXT NOT NULL DEFAULT 'default',
  base_budget_tokens INTEGER NOT NULL DEFAULT 2200,
  planner_reserve_tokens INTEGER NOT NULL DEFAULT 1100,
  writer_reserve_tokens INTEGER NOT NULL DEFAULT 1400,
  priority_a_budget INTEGER NOT NULL DEFAULT 1100,
  priority_b_budget INTEGER NOT NULL DEFAULT 800,
  priority_c_inline_budget INTEGER NOT NULL DEFAULT 300,
  compression_mode TEXT NOT NULL DEFAULT 'balanced'
    CHECK (compression_mode IN ('strict', 'balanced', 'expansive')),
  drop_thresholds JSONB NOT NULL DEFAULT '{"warn_at_ratio":0.9,"hard_at_ratio":1.0}'::jsonb,
  model_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS pack_budget_policy_v1_story_active_uniq
  ON public.pack_budget_policy_v1 (story_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.priority_override_rules_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  chapter_mode TEXT NOT NULL DEFAULT 'any',
  cast_pressure TEXT NOT NULL DEFAULT 'any',
  reveal_sensitivity TEXT NOT NULL DEFAULT 'any',
  timeline_mode TEXT NOT NULL DEFAULT 'any',
  pov_mode TEXT NOT NULL DEFAULT 'any',
  promote_to_a JSONB NOT NULL DEFAULT '[]'::jsonb,
  demote_to_c JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS priority_override_rules_v1_scope_key_active_uniq
  ON public.priority_override_rules_v1 (COALESCE(story_id, 0), rule_key)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.author_annotation_v1 (
  annotation_id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NULL,
  target_type TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  annotation_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  effective_from_chapter TEXT NULL,
  effective_to_chapter TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  supersedes_annotation_id BIGINT NULL REFERENCES public.author_annotation_v1(annotation_id) ON DELETE SET NULL,
  annotation_version INTEGER NOT NULL DEFAULT 1,
  reason TEXT NULL,
  actor TEXT NOT NULL DEFAULT 'author'
);

CREATE INDEX IF NOT EXISTS author_annotation_v1_story_chapter_status_idx
  ON public.author_annotation_v1 (story_id, chapter_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pre_chapter_profile_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  job_id BIGINT NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  chapter_mode TEXT NOT NULL,
  pov_mode TEXT NOT NULL,
  timeline_mode TEXT NOT NULL,
  reveal_sensitivity TEXT NOT NULL,
  cast_pressure TEXT NOT NULL,
  thread_pressure TEXT NOT NULL,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pre_chapter_profile_v1_story_chapter_idx
  ON public.pre_chapter_profile_v1 (story_id, chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_chapter_profile_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  job_id BIGINT NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  chapter_mode TEXT NOT NULL,
  pov_mode TEXT NOT NULL,
  timeline_mode TEXT NOT NULL,
  reveal_sensitivity TEXT NOT NULL,
  cast_pressure TEXT NOT NULL,
  thread_pressure TEXT NOT NULL,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_chapter_profile_v1_story_chapter_idx
  ON public.post_chapter_profile_v1 (story_id, chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.entity_resolution_snapshot_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_content_hash TEXT NOT NULL,
  relevant_entity_snapshot_hash TEXT NOT NULL,
  author_annotation_hash TEXT NOT NULL,
  identity_policy_hash TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'READY'
    CHECK (status IN ('READY', 'STALE', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_resolution_snapshot_v1_story_chapter_cache_uniq
  ON public.entity_resolution_snapshot_v1 (story_id, chapter_id, cache_key);

CREATE TABLE IF NOT EXISTS public.entity_merge_challenge_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NULL,
  challenged_entity_id TEXT NOT NULL,
  conflicting_surface_forms JSONB NOT NULL DEFAULT '[]'::jsonb,
  challenge_reason TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  affected_fact_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_action TEXT NOT NULL DEFAULT 'REVIEW',
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_merge_challenge_v1_story_chapter_status_idx
  ON public.entity_merge_challenge_v1 (story_id, chapter_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.analysis_delta_report_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'writing_analysis',
  source_ref TEXT NULL,
  source_hash TEXT NOT NULL,
  truth_pack_changed BOOLEAN NOT NULL DEFAULT true,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analysis_delta_report_v1_story_chapter_idx
  ON public.analysis_delta_report_v1 (story_id, chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.thread_state_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  label TEXT NOT NULL,
  origin_chapter TEXT NULL,
  last_touched_chapter TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  urgency TEXT NOT NULL DEFAULT 'medium',
  aging_score NUMERIC(6,3) NOT NULL DEFAULT 0,
  pressure_score NUMERIC(6,3) NOT NULL DEFAULT 0,
  related_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_scope TEXT NOT NULL DEFAULT 'reader',
  closure_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, thread_id)
);

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS entity_kind TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.timeline_anchor
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.timeline_anchor
  ADD COLUMN IF NOT EXISTS entity_kind TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.story_canon_fact
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.story_canon_fact
  ADD COLUMN IF NOT EXISTS entity_kind TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS pre_chapter_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS post_chapter_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS truth_context_pack_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS analysis_delta_report_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS pre_chapter_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS post_chapter_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS truth_context_pack_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.writing_scope_snapshot_v1
  ADD COLUMN IF NOT EXISTS analysis_delta_report_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.story_milestone
  ADD COLUMN IF NOT EXISTS analysis_delta_report_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.entity_truth_overlay
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.entity_truth_overlay
  ADD COLUMN IF NOT EXISTS entity_kind TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.entity_truth_overlay
  ADD COLUMN IF NOT EXISTS parent_collective_id TEXT NULL;

ALTER TABLE public.entity_truth_overlay
  ADD COLUMN IF NOT EXISTS collective_membership_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.entity_truth_overlay
  ADD COLUMN IF NOT EXISTS persona_owner_entity_id TEXT NULL;

ALTER TABLE public.entity_conflict_review
  ADD COLUMN IF NOT EXISTS universe_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.entity_conflict_review
  ADD COLUMN IF NOT EXISTS entity_kind TEXT NOT NULL DEFAULT 'individual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'canon_fact_entity_kind_check'
      AND conrelid = 'public.canon_fact'::regclass
  ) THEN
    ALTER TABLE public.canon_fact
      ADD CONSTRAINT canon_fact_entity_kind_check
      CHECK (entity_kind IN ('individual', 'collective', 'persona'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'timeline_anchor_entity_kind_check'
      AND conrelid = 'public.timeline_anchor'::regclass
  ) THEN
    ALTER TABLE public.timeline_anchor
      ADD CONSTRAINT timeline_anchor_entity_kind_check
      CHECK (entity_kind IN ('individual', 'collective', 'persona'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_canon_fact_entity_kind_check'
      AND conrelid = 'public.story_canon_fact'::regclass
  ) THEN
    ALTER TABLE public.story_canon_fact
      ADD CONSTRAINT story_canon_fact_entity_kind_check
      CHECK (entity_kind IN ('individual', 'collective', 'persona'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'entity_truth_overlay_entity_kind_check'
      AND conrelid = 'public.entity_truth_overlay'::regclass
  ) THEN
    ALTER TABLE public.entity_truth_overlay
      ADD CONSTRAINT entity_truth_overlay_entity_kind_check
      CHECK (entity_kind IN ('individual', 'collective', 'persona'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'entity_conflict_review_entity_kind_check'
      AND conrelid = 'public.entity_conflict_review'::regclass
  ) THEN
    ALTER TABLE public.entity_conflict_review
      ADD CONSTRAINT entity_conflict_review_entity_kind_check
      CHECK (entity_kind IN ('individual', 'collective', 'persona'));
  END IF;
END $$;

INSERT INTO public.pack_budget_policy_v1 (
  story_id,
  policy_version,
  default_model_class,
  base_budget_tokens,
  planner_reserve_tokens,
  writer_reserve_tokens,
  priority_a_budget,
  priority_b_budget,
  priority_c_inline_budget,
  compression_mode,
  drop_thresholds,
  model_overrides,
  created_by,
  is_active
)
SELECT
  s.id,
  1,
  'default',
  2200,
  1100,
  1400,
  1100,
  800,
  300,
  'balanced',
  '{"warn_at_ratio":0.9,"hard_at_ratio":1.0}'::jsonb,
  '[
    {"model_class":"32k","base_budget_tokens":2000,"priority_a_budget":1100,"priority_b_budget":650,"priority_c_inline_budget":250,"compression_mode":"strict"},
    {"model_class":"128k","base_budget_tokens":3200,"priority_a_budget":1500,"priority_b_budget":1200,"priority_c_inline_budget":500,"compression_mode":"expansive"}
  ]'::jsonb,
  'migration_075',
  true
FROM public.story_series s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pack_budget_policy_v1 p
  WHERE p.story_id = s.id
    AND p.is_active = true
);

INSERT INTO public.priority_override_rules_v1 (
  story_id,
  rule_key,
  chapter_mode,
  cast_pressure,
  reveal_sensitivity,
  timeline_mode,
  pov_mode,
  promote_to_a,
  demote_to_c,
  created_by,
  is_active
)
VALUES
  (NULL, 'reveal_high_sensitivity', 'reveal', 'any', 'high', 'any', 'any', '["knowledge_visibility","ambiguity_constraints"]'::jsonb, '["style_guidance"]'::jsonb, 'migration_075', true),
  (NULL, 'dialogue_tight_cast', 'dialogue', 'tight', 'any', 'any', 'any', '["voice_constraints","address_forms"]'::jsonb, '["dormant_thread_detail"]'::jsonb, 'migration_075', true),
  (NULL, 'flashback_timeline_priority', 'flashback', 'any', 'any', 'flashback', 'any', '["timeline_constraints"]'::jsonb, '["dormant_thread_detail"]'::jsonb, 'migration_075', true),
  (NULL, 'transition_thread_pressure', 'transition', 'any', 'any', 'any', 'any', '["thread_pressure_summary"]'::jsonb, '["style_guidance"]'::jsonb, 'migration_075', true)
ON CONFLICT DO NOTHING;

COMMIT;
