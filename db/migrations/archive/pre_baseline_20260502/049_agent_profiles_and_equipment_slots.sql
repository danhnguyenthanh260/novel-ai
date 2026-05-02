BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_profiles (
  id bigserial PRIMARY KEY,
  species_name text NOT NULL,
  nick_name text NOT NULL DEFAULT '',
  base_dna_id bigint NULL REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL,
  experience_pts bigint NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 100),
  is_sealed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_species
  ON public.agent_profiles(species_name);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_level
  ON public.agent_profiles(level DESC);

CREATE TABLE IF NOT EXISTS public.agent_equipment_slots (
  id bigserial PRIMARY KEY,
  agent_profile_id bigint NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  slot_type text NOT NULL CHECK (slot_type IN ('DNA', 'WEAPON_PROMPT', 'SKILL_GEM', 'MEMORY_SHARD')),
  artifact_ref_type text NOT NULL DEFAULT 'UNKNOWN',
  artifact_id text NOT NULL,
  stats_mod jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_equipment_slots_profile_story
  ON public.agent_equipment_slots(agent_profile_id, story_id);

CREATE INDEX IF NOT EXISTS idx_agent_equipment_slots_story_slot
  ON public.agent_equipment_slots(story_id, slot_type, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_equipment_active_slot
  ON public.agent_equipment_slots(agent_profile_id, story_id, slot_type)
  WHERE is_active = true;

ALTER TABLE IF EXISTS public.agent_run_trace
  ADD COLUMN IF NOT EXISTS agent_profile_id bigint NULL REFERENCES public.agent_profiles(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.agent_run_trace
  ADD COLUMN IF NOT EXISTS equipment_snapshot_json jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_agent_run_trace_profile_created
  ON public.agent_run_trace(agent_profile_id, created_at DESC);

COMMIT;
