BEGIN;

ALTER TABLE public.story_series
  ADD COLUMN IF NOT EXISTS settings_json jsonb NOT NULL DEFAULT jsonb_build_object('thread_orphan_n', 5),
  ADD COLUMN IF NOT EXISTS map_locked boolean NOT NULL DEFAULT false;

UPDATE public.story_series
SET settings_json = jsonb_set(
  COALESCE(settings_json, '{}'::jsonb),
  '{thread_orphan_n}',
  COALESCE(settings_json -> 'thread_orphan_n', '5'::jsonb),
  true
)
WHERE NOT (COALESCE(settings_json, '{}'::jsonb) ? 'thread_orphan_n');

CREATE TABLE IF NOT EXISTS public.story_arc (
  id         bigserial PRIMARY KEY,
  story_id   bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  slug       text NOT NULL,
  name       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('main','sub')),
  act_model  smallint NOT NULL DEFAULT 3 CHECK (act_model IN (3, 5)),
  order_no   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_story_arc_story_order
  ON public.story_arc(story_id, order_no ASC, id ASC);

CREATE TABLE IF NOT EXISTS public.story_thread (
  id         bigserial PRIMARY KEY,
  story_id   bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  slug       text NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('plot_line','character_arc')),
  importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  color      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_story_thread_story_type
  ON public.story_thread(story_id, type, importance DESC, id ASC);

CREATE TABLE IF NOT EXISTS public.story_map_version (
  id           bigserial PRIMARY KEY,
  story_id     bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  version_no   integer NOT NULL,
  status       text NOT NULL CHECK (status IN ('draft','committed')),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  payload_hash text,
  UNIQUE (story_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_story_map_version_story_created
  ON public.story_map_version(story_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.story_map_state (
  story_id            bigint PRIMARY KEY REFERENCES public.story_series(id) ON DELETE CASCADE,
  active_version_id   bigint REFERENCES public.story_map_version(id) ON DELETE SET NULL,
  working_version_id  bigint REFERENCES public.story_map_version(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.story_scene_map (
  id             bigserial PRIMARY KEY,
  map_version_id bigint NOT NULL REFERENCES public.story_map_version(id) ON DELETE CASCADE,
  scene_id       bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  chapter_id     text NOT NULL,
  sequence_no    integer NOT NULL DEFAULT 0,
  act_label      text,
  arc_id         bigint REFERENCES public.story_arc(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_version_id, scene_id)
);

CREATE INDEX IF NOT EXISTS idx_story_scene_map_version_order
  ON public.story_scene_map(map_version_id, chapter_id, sequence_no, scene_id);

CREATE TABLE IF NOT EXISTS public.story_beat (
  id             bigserial PRIMARY KEY,
  map_version_id bigint NOT NULL REFERENCES public.story_map_version(id) ON DELETE CASCADE,
  scene_id       bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  beat_idx       integer NOT NULL CHECK (beat_idx >= 0),
  goal           text NOT NULL DEFAULT '',
  conflict       text NOT NULL DEFAULT '',
  outcome        text NOT NULL DEFAULT '',
  pov            text NOT NULL DEFAULT '',
  thread_ids     bigint[] NOT NULL DEFAULT ARRAY[]::bigint[],
  arc_id         bigint REFERENCES public.story_arc(id) ON DELETE SET NULL,
  notes_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_version_id, scene_id, beat_idx)
);

CREATE INDEX IF NOT EXISTS idx_story_beat_scene_order
  ON public.story_beat(map_version_id, scene_id, beat_idx ASC);

CREATE INDEX IF NOT EXISTS idx_story_beat_thread_ids_gin
  ON public.story_beat USING gin(thread_ids);

CREATE OR REPLACE FUNCTION public.story_map_state_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_map_state_updated_at ON public.story_map_state;
CREATE TRIGGER trg_story_map_state_updated_at
BEFORE UPDATE ON public.story_map_state
FOR EACH ROW EXECUTE FUNCTION public.story_map_state_touch_updated_at();

CREATE OR REPLACE FUNCTION public.story_scene_map_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_scene_map_updated_at ON public.story_scene_map;
CREATE TRIGGER trg_story_scene_map_updated_at
BEFORE UPDATE ON public.story_scene_map
FOR EACH ROW EXECUTE FUNCTION public.story_scene_map_touch_updated_at();

CREATE OR REPLACE FUNCTION public.story_beat_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_beat_updated_at ON public.story_beat;
CREATE TRIGGER trg_story_beat_updated_at
BEFORE UPDATE ON public.story_beat
FOR EACH ROW EXECUTE FUNCTION public.story_beat_touch_updated_at();

COMMIT;

