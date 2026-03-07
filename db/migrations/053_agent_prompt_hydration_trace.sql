CREATE TABLE IF NOT EXISTS public.agent_prompt_hydration_trace (
  id BIGSERIAL PRIMARY KEY,
  run_trace_id BIGINT NULL REFERENCES public.agent_run_trace(id) ON DELETE SET NULL,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NULL,
  task_id BIGINT NULL REFERENCES public.ingest_task(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL DEFAULT '',
  agent_name TEXT NOT NULL,
  prompt_version_id BIGINT NULL REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL,
  context_snapshot_id BIGINT NULL REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL,
  hydration_inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  hydration_render_steps_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  hydration_output_hash TEXT NULL,
  hydration_output_text TEXT NULL,
  llm_request_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens_prompt_base INT NULL,
  tokens_rules_injected INT NULL,
  tokens_memory_injected INT NULL,
  tokens_feedback_injected INT NULL,
  tokens_truncated INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_prompt_hydration_trace_story_agent_created
  ON public.agent_prompt_hydration_trace (story_id, agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_prompt_hydration_trace_run_trace
  ON public.agent_prompt_hydration_trace (run_trace_id);

CREATE INDEX IF NOT EXISTS idx_agent_prompt_hydration_trace_prompt_version
  ON public.agent_prompt_hydration_trace (prompt_version_id);
