BEGIN;

CREATE TABLE IF NOT EXISTS public.story_canon_fact (
  id           bigserial PRIMARY KEY,
  story_id     bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  category     text NOT NULL CHECK (category IN ('character','location','item','lore','event','relationship')),
  content      text NOT NULL,
  importance   smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  source_ref   text,
  content_tsv  tsvector,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.story_canon_fact_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := setweight(to_tsvector('simple', unaccent(coalesce(NEW.content, ''))), 'A');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_canon_fact_tsv ON public.story_canon_fact;
CREATE TRIGGER trg_story_canon_fact_tsv
BEFORE INSERT OR UPDATE OF content
ON public.story_canon_fact
FOR EACH ROW EXECUTE FUNCTION public.story_canon_fact_tsv_update();

CREATE INDEX IF NOT EXISTS idx_story_canon_fact_story_rank
  ON public.story_canon_fact(story_id, importance DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_canon_fact_tsv_gin
  ON public.story_canon_fact USING gin(content_tsv);

CREATE TABLE IF NOT EXISTS public.ingest_job (
  id               bigserial PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  created_by       text,
  mode             text NOT NULL CHECK (mode IN ('AUTO_LOCK','REVIEW_GATE')),
  status           text NOT NULL CHECK (status IN ('PENDING','RUNNING','DONE','FAILED','CANCELLED')),
  config_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_tasks      integer NOT NULL DEFAULT 0,
  completed_tasks  integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_job_story_status_time
  ON public.ingest_job(story_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ingest_task (
  id           bigserial PRIMARY KEY,
  job_id       bigint NOT NULL REFERENCES public.ingest_job(id) ON DELETE CASCADE,
  story_id     bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  unit_type    text NOT NULL CHECK (unit_type IN ('chapter','scene')),
  source_path  text,
  seq_no       integer NOT NULL,
  status       text NOT NULL CHECK (status IN ('PENDING','RUNNING','WAIT_REVIEW','DONE','FAILED')),
  attempts     integer NOT NULL DEFAULT 0,
  error        text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ingest_task_job_seq
  ON public.ingest_task(job_id, seq_no);

CREATE INDEX IF NOT EXISTS idx_ingest_task_poll
  ON public.ingest_task(status, updated_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_ingest_task_job_status
  ON public.ingest_task(job_id, status, seq_no ASC);

CREATE TABLE IF NOT EXISTS public.review_request (
  id               bigserial PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  scene_version_id bigint NOT NULL REFERENCES public.narrative_scene_version(id) ON DELETE RESTRICT,
  job_id           bigint REFERENCES public.ingest_job(id) ON DELETE SET NULL,
  status           text NOT NULL CHECK (status IN ('OPEN','SUBMITTED','APPLIED')),
  rubric_version   text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_request_story_status
  ON public.review_request(story_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_response (
  id                    bigserial PRIMARY KEY,
  request_id            bigint NOT NULL REFERENCES public.review_request(id) ON DELETE CASCADE,
  reviewer_name         text,
  scores_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  flags_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggestions_text      text,
  canon_proposals_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_response_request_time
  ON public.review_response(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.review_apply_log (
  id                  bigserial PRIMARY KEY,
  request_id          bigint NOT NULL REFERENCES public.review_request(id) ON DELETE CASCADE,
  applied_by          text,
  applied_at          timestamptz NOT NULL DEFAULT now(),
  canon_inserted_ids  bigint[] NOT NULL DEFAULT ARRAY[]::bigint[]
);

CREATE INDEX IF NOT EXISTS idx_review_apply_log_request
  ON public.review_apply_log(request_id, applied_at DESC);

CREATE OR REPLACE FUNCTION public.ingest_job_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingest_job_updated_at ON public.ingest_job;
CREATE TRIGGER trg_ingest_job_updated_at
BEFORE UPDATE ON public.ingest_job
FOR EACH ROW EXECUTE FUNCTION public.ingest_job_touch_updated_at();

CREATE OR REPLACE FUNCTION public.ingest_task_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingest_task_updated_at ON public.ingest_task;
CREATE TRIGGER trg_ingest_task_updated_at
BEFORE UPDATE ON public.ingest_task
FOR EACH ROW EXECUTE FUNCTION public.ingest_task_touch_updated_at();

COMMIT;
