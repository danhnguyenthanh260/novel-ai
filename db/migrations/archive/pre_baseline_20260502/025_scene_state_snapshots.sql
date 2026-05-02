BEGIN;

CREATE TABLE IF NOT EXISTS public.narrative_scene_state (
  id               bigserial PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scene_id         bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  scene_version_id bigint NOT NULL REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE,
  parent_state_id  bigint REFERENCES public.narrative_scene_state(id),
  
  state_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,
  algo_version     text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(scene_version_id, algo_version)
);

CREATE INDEX IF NOT EXISTS idx_scene_state_story_created 
  ON public.narrative_scene_state(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_state_scene 
  ON public.narrative_scene_state(scene_id);

COMMIT;
