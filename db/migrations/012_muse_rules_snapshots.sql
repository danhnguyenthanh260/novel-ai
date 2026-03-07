BEGIN;

CREATE TABLE IF NOT EXISTS public.muse_rules (
  id            bigserial PRIMARY KEY,
  story_id      bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  type          text NOT NULL CHECK (type IN ('avoid', 'enforce', 'logic', 'pacing', 'voice')),
  rule_text     text NOT NULL,
  why           text,
  bad_examples  text[] NOT NULL DEFAULT ARRAY[]::text[],
  good_examples text[] NOT NULL DEFAULT ARRAY[]::text[],
  weight        smallint NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.muse_rules_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_muse_rules_updated_at ON public.muse_rules;
CREATE TRIGGER trg_muse_rules_updated_at
BEFORE UPDATE ON public.muse_rules
FOR EACH ROW EXECUTE FUNCTION public.muse_rules_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_muse_rules_story_active_weight
  ON public.muse_rules(story_id, is_active, weight DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_muse_rules_story_type
  ON public.muse_rules(story_id, type, is_active);

CREATE TABLE IF NOT EXISTS public.muse_snapshots (
  id                 bigserial PRIMARY KEY,
  story_id           bigint NOT NULL REFERENCES public.story_series(id) ON DELETE RESTRICT,
  action             text NOT NULL DEFAULT 'MANUAL' CHECK (action IN ('MANUAL', 'APPLY', 'ROLLBACK')),
  source_snapshot_id bigint REFERENCES public.muse_snapshots(id) ON DELETE SET NULL,
  note               text,
  rules_snapshot     jsonb NOT NULL,
  created_by         text NOT NULL DEFAULT 'system',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_muse_snapshots_story_created
  ON public.muse_snapshots(story_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_muse_snapshots_story_action
  ON public.muse_snapshots(story_id, action, created_at DESC);

COMMIT;
