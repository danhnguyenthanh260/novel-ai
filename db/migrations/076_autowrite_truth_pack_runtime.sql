BEGIN;

CREATE TABLE IF NOT EXISTS public.truth_adjudication_snapshot_v1 (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  entity_resolution_snapshot_id BIGINT NULL REFERENCES public.entity_resolution_snapshot_v1(id) ON DELETE SET NULL,
  fact_status TEXT NOT NULL DEFAULT 'UNVETTED',
  adjudication_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS truth_adjudication_snapshot_v1_story_chapter_idx
  ON public.truth_adjudication_snapshot_v1 (story_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS entity_resolution_snapshot_v1_cache_key_idx
  ON public.entity_resolution_snapshot_v1 (cache_key);

CREATE TABLE IF NOT EXISTS public.autowrite_cutover_state_v1 (
  story_id BIGINT PRIMARY KEY REFERENCES public.story_series(id) ON DELETE CASCADE,
  cutover_stage TEXT NOT NULL DEFAULT 'STAGE_1_SHADOW'
    CHECK (cutover_stage IN ('STAGE_1_SHADOW', 'STAGE_2_PLANNER', 'STAGE_3_PROSE', 'STAGE_4_LEGACY_RETIRED')),
  parity_window_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.autowrite_cutover_state_v1 (story_id, cutover_stage, parity_window_stats)
SELECT s.id, 'STAGE_1_SHADOW', '{}'::jsonb
FROM public.story_series s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.autowrite_cutover_state_v1 c
  WHERE c.story_id = s.id
);

COMMIT;
