BEGIN;

-- Split feedback: taxonomy/rule-pack versioning + reviewer template parse fields.
ALTER TABLE IF EXISTS public.split_feedback
  ADD COLUMN IF NOT EXISTS taxonomy_version text NULL,
  ADD COLUMN IF NOT EXISTS rule_pack_version text NULL,
  ADD COLUMN IF NOT EXISTS version_pair_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS token_key text NULL,
  ADD COLUMN IF NOT EXISTS location_ref text NULL,
  ADD COLUMN IF NOT EXISTS detection_mode text NULL,
  ADD COLUMN IF NOT EXISTS enforcement_mode text NULL,
  ADD COLUMN IF NOT EXISTS reason_code text NULL,
  ADD COLUMN IF NOT EXISTS freeze_window_id text NULL,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS split_feedback_version_pair_created_idx
  ON public.split_feedback(taxonomy_version, rule_pack_version, created_at DESC);

CREATE INDEX IF NOT EXISTS split_feedback_reason_code_created_idx
  ON public.split_feedback(reason_code, created_at DESC);

-- Agent run trace: same contract fields for runtime consistency.
ALTER TABLE IF EXISTS public.agent_run_trace
  ADD COLUMN IF NOT EXISTS taxonomy_version text NULL,
  ADD COLUMN IF NOT EXISTS rule_pack_version text NULL,
  ADD COLUMN IF NOT EXISTS version_pair_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS token_key text NULL,
  ADD COLUMN IF NOT EXISTS detection_mode text NULL,
  ADD COLUMN IF NOT EXISTS enforcement_mode text NULL,
  ADD COLUMN IF NOT EXISTS freeze_window_id text NULL,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS agent_run_trace_version_pair_created_idx
  ON public.agent_run_trace(taxonomy_version, rule_pack_version, created_at DESC);

-- Minimal compatibility map to support deployment gate decisions.
CREATE TABLE IF NOT EXISTS public.taxonomy_rule_pack_compatibility (
  id bigserial PRIMARY KEY,
  taxonomy_version text NOT NULL,
  rule_pack_version text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taxonomy_version, rule_pack_version)
);

-- Token change audit contract (promotion/demotion/severity/action changes).
CREATE TABLE IF NOT EXISTS public.token_change_audit_event (
  id bigserial PRIMARY KEY,
  token_key text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('PROMOTE', 'DEMOTE', 'SEVERITY_CHANGE', 'ACTION_CHANGE')),
  from_state text NULL,
  to_state text NULL,
  evidence_ref text NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  taxonomy_version text NOT NULL,
  rule_pack_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS token_change_audit_token_created_idx
  ON public.token_change_audit_event(token_key, created_at DESC);

COMMIT;

