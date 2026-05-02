BEGIN;

CREATE TABLE IF NOT EXISTS public.core_memory_vetting_state (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('CANON_FACT', 'TIMELINE_ANCHOR', 'STORY_CANON_FACT')),
  source_id bigint NOT NULL,
  review_status text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS core_memory_vetting_state_story_status_kind_idx
  ON public.core_memory_vetting_state(story_id, review_status, source_kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.core_memory_vetting_event (
  id bigserial PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('CANON_FACT', 'TIMELINE_ANCHOR', 'STORY_CANON_FACT')),
  source_id bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('APPROVE', 'REJECT', 'RESET_TO_PENDING')),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  note text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS core_memory_vetting_event_story_source_time_idx
  ON public.core_memory_vetting_event(story_id, source_kind, source_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.core_memory_vetting_state_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_core_memory_vetting_state_updated_at ON public.core_memory_vetting_state;
CREATE TRIGGER trg_core_memory_vetting_state_updated_at
BEFORE UPDATE ON public.core_memory_vetting_state
FOR EACH ROW EXECUTE FUNCTION public.core_memory_vetting_state_touch_updated_at();

INSERT INTO public.core_memory_vetting_state
  (story_id, source_kind, source_id, review_status)
SELECT f.story_id, 'CANON_FACT', f.id, 'PENDING'
FROM public.canon_fact f
ON CONFLICT (story_id, source_kind, source_id) DO NOTHING;

INSERT INTO public.core_memory_vetting_state
  (story_id, source_kind, source_id, review_status)
SELECT t.story_id, 'TIMELINE_ANCHOR', t.id, 'PENDING'
FROM public.timeline_anchor t
ON CONFLICT (story_id, source_kind, source_id) DO NOTHING;

INSERT INTO public.core_memory_vetting_state
  (story_id, source_kind, source_id, review_status)
SELECT s.story_id, 'STORY_CANON_FACT', s.id, 'PENDING'
FROM public.story_canon_fact s
ON CONFLICT (story_id, source_kind, source_id) DO NOTHING;

COMMIT;
