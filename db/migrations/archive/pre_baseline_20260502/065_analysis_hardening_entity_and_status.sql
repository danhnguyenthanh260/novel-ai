BEGIN;

ALTER TABLE public.canon_fact
  ADD COLUMN IF NOT EXISTS entity_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'canon_fact_entity_type_check'
      AND conrelid = 'public.canon_fact'::regclass
  ) THEN
    ALTER TABLE public.canon_fact
      ADD CONSTRAINT canon_fact_entity_type_check
      CHECK (
        entity_type IS NULL
        OR entity_type IN ('PERSON', 'LOCATION', 'ORG', 'ITEM', 'OTHER')
      );
  END IF;
END $$;

ALTER TABLE public.writing_snapshot_v3
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'DRAFT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'writing_snapshot_v3_approval_status_check'
      AND conrelid = 'public.writing_snapshot_v3'::regclass
  ) THEN
    ALTER TABLE public.writing_snapshot_v3
      ADD CONSTRAINT writing_snapshot_v3_approval_status_check
      CHECK (approval_status IN ('DRAFT', 'APPROVED', 'SUPERSEDED'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'writing_scope_snapshot_v1'
  ) THEN
    EXECUTE 'ALTER TABLE public.writing_scope_snapshot_v1 ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT ''DRAFT''';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'writing_scope_snapshot_v1_approval_status_check'
        AND conrelid = 'public.writing_scope_snapshot_v1'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE public.writing_scope_snapshot_v1 ADD CONSTRAINT writing_scope_snapshot_v1_approval_status_check CHECK (approval_status IN (''DRAFT'', ''APPROVED'', ''SUPERSEDED''))';
    END IF;
  END IF;
END $$;

COMMIT;
