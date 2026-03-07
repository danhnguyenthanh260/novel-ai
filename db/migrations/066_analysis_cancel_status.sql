BEGIN;

ALTER TABLE public.writing_snapshot_v3
  DROP CONSTRAINT IF EXISTS writing_snapshot_v3_approval_status_check;

ALTER TABLE public.writing_snapshot_v3
  ADD CONSTRAINT writing_snapshot_v3_approval_status_check
  CHECK (approval_status IN ('DRAFT', 'APPROVED', 'SUPERSEDED', 'CANCELED'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'writing_scope_snapshot_v1'
  ) THEN
    EXECUTE 'ALTER TABLE public.writing_scope_snapshot_v1 DROP CONSTRAINT IF EXISTS writing_scope_snapshot_v1_approval_status_check';
    EXECUTE 'ALTER TABLE public.writing_scope_snapshot_v1 ADD CONSTRAINT writing_scope_snapshot_v1_approval_status_check CHECK (approval_status IN (''DRAFT'', ''APPROVED'', ''SUPERSEDED'', ''CANCELED''))';
  END IF;
END $$;

COMMIT;
