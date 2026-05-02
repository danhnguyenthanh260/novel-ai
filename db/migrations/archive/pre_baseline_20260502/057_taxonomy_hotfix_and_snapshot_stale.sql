BEGIN;

-- Preserve mode transition history to audit heuristic -> deterministic upgrades.
ALTER TABLE IF EXISTS public.split_feedback
  ADD COLUMN IF NOT EXISTS original_detection_mode text NULL,
  ADD COLUMN IF NOT EXISTS original_enforcement_mode text NULL,
  ADD COLUMN IF NOT EXISTS current_detection_mode text NULL,
  ADD COLUMN IF NOT EXISTS current_enforcement_mode text NULL;

ALTER TABLE IF EXISTS public.agent_run_trace
  ADD COLUMN IF NOT EXISTS original_detection_mode text NULL,
  ADD COLUMN IF NOT EXISTS original_enforcement_mode text NULL,
  ADD COLUMN IF NOT EXISTS current_detection_mode text NULL,
  ADD COLUMN IF NOT EXISTS current_enforcement_mode text NULL;

CREATE INDEX IF NOT EXISTS split_feedback_mode_transition_idx
  ON public.split_feedback(token_key, original_detection_mode, current_detection_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_run_trace_mode_transition_idx
  ON public.agent_run_trace(token_key, original_detection_mode, current_detection_mode, created_at DESC);

-- Emergency freeze-break audit trail.
CREATE TABLE IF NOT EXISTS public.taxonomy_hotfix_event (
  id bigserial PRIMARY KEY,
  taxonomy_version text NOT NULL,
  rule_pack_version text NOT NULL,
  action text NOT NULL CHECK (action IN ('BREAK_PAIR', 'RESTORE_PAIR')),
  reason text NOT NULL,
  initiated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxonomy_hotfix_event_pair_created_idx
  ON public.taxonomy_hotfix_event(taxonomy_version, rule_pack_version, created_at DESC);

-- Snapshot stale metadata for downstream writing agent safety.
ALTER TABLE IF EXISTS public.narrative_scene_state
  ADD COLUMN IF NOT EXISTS stale_reason text NULL,
  ADD COLUMN IF NOT EXISTS stale_marked_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS narrative_scene_state_stale_idx
  ON public.narrative_scene_state(story_id, is_stale, stale_marked_at DESC);

COMMIT;
