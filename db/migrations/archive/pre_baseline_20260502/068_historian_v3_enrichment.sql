BEGIN;

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS is_unreliable boolean NOT NULL DEFAULT false;

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS affinity_weight numeric(6,4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'canon_fact_affinity_weight_range_check'
      AND conrelid = 'public.canon_fact'::regclass
  ) THEN
    ALTER TABLE public.canon_fact
      ADD CONSTRAINT canon_fact_affinity_weight_range_check
      CHECK (
        affinity_weight IS NULL
        OR (affinity_weight >= -1.0 AND affinity_weight <= 1.0)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'writing_snapshot_v3_snapshot_json_object_check'
      AND conrelid = 'public.writing_snapshot_v3'::regclass
  ) THEN
    ALTER TABLE public.writing_snapshot_v3
      ADD CONSTRAINT writing_snapshot_v3_snapshot_json_object_check
      CHECK (jsonb_typeof(snapshot_json) = 'object')
      NOT VALID;
  END IF;
END $$;

COMMIT;
