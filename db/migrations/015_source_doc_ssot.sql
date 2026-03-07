BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.source_doc (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id         bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  doc_type         text NOT NULL CHECK (doc_type IN ('ingest_chapter')),
  origin           jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text         text NOT NULL,
  raw_text_sha256  text NOT NULL,
  char_len         integer NOT NULL CHECK (char_len >= 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_doc_story_sha
  ON public.source_doc(story_id, raw_text_sha256);

CREATE INDEX IF NOT EXISTS idx_source_doc_story_created
  ON public.source_doc(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_doc_doc_type_created
  ON public.source_doc(doc_type, created_at DESC);

COMMIT;
