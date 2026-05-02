BEGIN;

CREATE TABLE IF NOT EXISTS public.canon_fact (
  id               bigserial PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scene_id         bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  scene_version_id bigint NOT NULL REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE,
  algo_version     text NOT NULL,
  subject          text NOT NULL,
  predicate        text NOT NULL,
  object           text NOT NULL,
  confidence       numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0 AND confidence <= 1),
  tags             text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_trace     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canon_fact_story_created
  ON public.canon_fact(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canon_fact_scene
  ON public.canon_fact(scene_id);

CREATE INDEX IF NOT EXISTS idx_canon_fact_scene_version
  ON public.canon_fact(scene_version_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_canon_fact_idempotency
  ON public.canon_fact(scene_version_id, algo_version, subject, predicate, object);

CREATE TABLE IF NOT EXISTS public.timeline_anchor (
  id               bigserial PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scene_id         bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  scene_version_id bigint NOT NULL REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE,
  algo_version     text NOT NULL,
  event_label      text NOT NULL,
  relative_time    text,
  absolute_time    text,
  location         text,
  participants     text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_trace     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_anchor_story_created
  ON public.timeline_anchor(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_timeline_anchor_scene
  ON public.timeline_anchor(scene_id);

CREATE INDEX IF NOT EXISTS idx_timeline_anchor_scene_version
  ON public.timeline_anchor(scene_version_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_timeline_anchor_idempotency
  ON public.timeline_anchor(scene_version_id, algo_version, event_label);

CREATE TABLE IF NOT EXISTS public.style_profile_scene (
  id                  bigserial PRIMARY KEY,
  story_id            bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scene_id            bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  scene_version_id    bigint NOT NULL REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE,
  algo_version        text NOT NULL,
  sentence_complexity numeric(5,4),
  dialogue_ratio      numeric(5,4),
  metaphor_density    numeric(5,4),
  sensory_sight       numeric(5,4),
  sensory_sound       numeric(5,4),
  sensory_touch       numeric(5,4),
  sensory_smell       numeric(5,4),
  sensory_taste       numeric(5,4),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scene_version_id, algo_version)
);

CREATE INDEX IF NOT EXISTS idx_style_profile_scene_story_created
  ON public.style_profile_scene(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_profile_scene_scene
  ON public.style_profile_scene(scene_id);

CREATE TABLE IF NOT EXISTS public.memory_enrich_task (
  id               bigserial PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  scene_id         bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  scene_version_id bigint NOT NULL REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE,
  algo_version     text NOT NULL,
  status           text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'RUNNING', 'DONE', 'FAILED')),
  retry_count      integer NOT NULL DEFAULT 0,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scene_version_id, algo_version)
);

CREATE INDEX IF NOT EXISTS idx_memory_enrich_task_poll
  ON public.memory_enrich_task(status, updated_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_memory_enrich_task_story_status
  ON public.memory_enrich_task(story_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.memory_enrich_task_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memory_enrich_task_updated_at ON public.memory_enrich_task;
CREATE TRIGGER trg_memory_enrich_task_updated_at
BEFORE UPDATE ON public.memory_enrich_task
FOR EACH ROW EXECUTE FUNCTION public.memory_enrich_task_touch_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_memory_enrich_task_v1() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.memory_enrich_task
    (story_id, scene_id, scene_version_id, algo_version, status)
  VALUES
    (NEW.story_id, NEW.scene_id, NEW.id, 'memory_v1', 'READY')
  ON CONFLICT (scene_version_id, algo_version) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scene_version_enqueue_memory_v1 ON public.narrative_scene_version;
CREATE TRIGGER trg_scene_version_enqueue_memory_v1
AFTER INSERT ON public.narrative_scene_version
FOR EACH ROW EXECUTE FUNCTION public.enqueue_memory_enrich_task_v1();

COMMIT;
