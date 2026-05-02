-- Agent Prompt Governance Foundation (Phase 0/1)

CREATE TABLE IF NOT EXISTS public.agent_prompt_profile (
  id bigserial PRIMARY KEY,
  agent_name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global', 'story', 'chapter')),
  story_id bigint NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_prompt_profile_scope_unique_idx
  ON public.agent_prompt_profile(
    agent_name,
    scope,
    COALESCE(story_id, 0),
    COALESCE(chapter_id, '')
  );

CREATE TABLE IF NOT EXISTS public.agent_prompt_version (
  id bigserial PRIMARY KEY,
  profile_id bigint NOT NULL REFERENCES public.agent_prompt_profile(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  system_prompt text NOT NULL,
  developer_prompt text NULL,
  output_contract_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  guardrail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_note text NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CANARY', 'ACTIVE', 'ARCHIVED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_prompt_version_profile_version_unique UNIQUE (profile_id, version_no)
);

CREATE INDEX IF NOT EXISTS agent_prompt_version_profile_status_idx
  ON public.agent_prompt_version(profile_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_prompt_experiment (
  id bigserial PRIMARY KEY,
  agent_name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global', 'story', 'chapter')),
  story_id bigint NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NULL,
  baseline_version_id bigint NOT NULL REFERENCES public.agent_prompt_version(id) ON DELETE CASCADE,
  candidate_version_id bigint NOT NULL REFERENCES public.agent_prompt_version(id) ON DELETE CASCADE,
  traffic_percent int NOT NULL CHECK (traffic_percent >= 1 AND traffic_percent <= 100),
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'PAUSED', 'COMPLETED', 'ROLLED_BACK')),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS agent_prompt_experiment_lookup_idx
  ON public.agent_prompt_experiment(agent_name, scope, COALESCE(story_id, 0), COALESCE(chapter_id, ''), status, start_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_context_snapshot (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NULL,
  snapshot_json jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_context_snapshot_story_chapter_created_idx
  ON public.agent_context_snapshot(story_id, chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_run_trace (
  id bigserial PRIMARY KEY,
  job_id bigint NULL REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  task_id bigint NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NULL,
  agent_name text NOT NULL,
  prompt_version_id bigint NULL REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL,
  model_name text NULL,
  input_hash text NOT NULL,
  output_hash text NULL,
  latency_ms int NULL,
  token_in int NULL,
  token_out int NULL,
  status text NOT NULL CHECK (status IN ('DONE', 'FAILED', 'TIMEOUT')),
  error_code text NULL,
  quality_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot_id bigint NULL REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL,
  rationale_summary text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_run_trace_story_agent_created_idx
  ON public.agent_run_trace(story_id, agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_run_trace_story_chapter_created_idx
  ON public.agent_run_trace(story_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_run_trace_prompt_version_created_idx
  ON public.agent_run_trace(prompt_version_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_tuning_event (
  id bigserial PRIMARY KEY,
  agent_name text NOT NULL,
  from_version_id bigint NULL REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL,
  to_version_id bigint NOT NULL REFERENCES public.agent_prompt_version(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('PROMOTE_CANARY', 'PROMOTE_ACTIVE', 'ROLLBACK', 'ARCHIVE')),
  reason text NOT NULL,
  author text NOT NULL,
  approved_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_tuning_event_agent_created_idx
  ON public.agent_tuning_event(agent_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_feedback_loop (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NULL,
  agent_name text NOT NULL,
  run_trace_id bigint NULL REFERENCES public.agent_run_trace(id) ON DELETE SET NULL,
  feedback_source text NOT NULL CHECK (feedback_source IN ('HUMAN', 'SUPERVISOR', 'CRITIC', 'SYSTEM')),
  feedback_type text NOT NULL CHECK (feedback_type IN ('KEEP', 'AVOID', 'FIX', 'RULE')),
  feedback_text text NOT NULL,
  weight numeric(5,2) NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MUTED', 'ARCHIVED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_feedback_loop_story_agent_created_idx
  ON public.agent_feedback_loop(story_id, agent_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_memory_vector (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id text NULL,
  agent_name text NOT NULL,
  source_run_trace_id bigint NULL REFERENCES public.agent_run_trace(id) ON DELETE SET NULL,
  memory_type text NOT NULL CHECK (memory_type IN ('POSITIVE_EXAMPLE', 'NEGATIVE_PATTERN', 'STYLE_ANCHOR')),
  memory_text text NOT NULL,
  embedding_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric(5,2) NOT NULL DEFAULT 0,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memory_vector_story_agent_created_idx
  ON public.agent_memory_vector(story_id, agent_name, created_at DESC);
