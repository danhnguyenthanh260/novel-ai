BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.narrative_scene
  ADD COLUMN IF NOT EXISTS current_version_id bigint,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFTING',
  ADD COLUMN IF NOT EXISTS title text;

CREATE TABLE IF NOT EXISTS public.narrative_scene_version (
  id          bigserial PRIMARY KEY,
  scene_id    bigint NOT NULL REFERENCES public.narrative_scene(id) ON DELETE CASCADE,
  version_no  integer NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('outline','draft','rewrite','evaluate')),
  text_content text,
  beats_json   jsonb,
  eval_json    jsonb,
  summary      text,
  created_at   timestamp without time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scene_version_no
  ON public.narrative_scene_version(scene_id, version_no);

CREATE INDEX IF NOT EXISTS idx_scene_version_scene
  ON public.narrative_scene_version(scene_id, created_at DESC);

ALTER TABLE public.narrative_scene_version
  ADD COLUMN IF NOT EXISTS tsv tsvector;

CREATE OR REPLACE FUNCTION public.scene_version_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.text_content,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.summary,''))), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scene_version_tsv ON public.narrative_scene_version;
CREATE TRIGGER trg_scene_version_tsv
BEFORE INSERT OR UPDATE OF text_content, summary
ON public.narrative_scene_version
FOR EACH ROW EXECUTE FUNCTION public.scene_version_tsv_update();

CREATE INDEX IF NOT EXISTS idx_scene_version_tsv_gin
  ON public.narrative_scene_version USING gin(tsv);

CREATE TABLE IF NOT EXISTS public.narrative_pipeline_run (
  id           bigserial PRIMARY KEY,
  scene_id     bigint REFERENCES public.narrative_scene(id) ON DELETE SET NULL,
  step         text NOT NULL CHECK (step IN ('intake','outline','draft','evaluate','rewrite')),
  input_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  llm_params   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'OK' CHECK (status IN ('OK','ERROR')),
  error_text   text,
  created_at   timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_run_scene_step_time
  ON public.narrative_pipeline_run(scene_id, step, created_at DESC);

CREATE TABLE IF NOT EXISTS public.timeline_event (
  id          bigserial PRIMARY KEY,
  event_key   text UNIQUE,
  start_ts    timestamp without time zone,
  end_ts      timestamp without time zone,
  title       text,
  body        text NOT NULL,
  tags        text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at  timestamp without time zone NOT NULL DEFAULT now(),
  updated_at  timestamp without time zone NOT NULL DEFAULT now(),
  tsv         tsvector
);

CREATE OR REPLACE FUNCTION public.timeline_event_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.body,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(array_to_string(NEW.tags,' '))), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timeline_tsv ON public.timeline_event;
CREATE TRIGGER trg_timeline_tsv
BEFORE INSERT OR UPDATE OF title, body, tags
ON public.timeline_event
FOR EACH ROW EXECUTE FUNCTION public.timeline_event_tsv_update();

CREATE INDEX IF NOT EXISTS idx_timeline_tsv_gin
  ON public.timeline_event USING gin(tsv);

CREATE OR REPLACE VIEW public.narrative_scene_latest AS
SELECT
  s.id,
  s.chapter_id,
  s.idx,
  s.title,
  s.status,
  s.current_version_id,
  v.kind       AS current_kind,
  v.version_no AS current_version_no,
  v.text_content AS current_text,
  v.beats_json AS current_beats,
  v.eval_json  AS current_eval,
  s.created_at,
  s.updated_at
FROM public.narrative_scene s
LEFT JOIN public.narrative_scene_version v
  ON v.id = s.current_version_id;

COMMIT;
