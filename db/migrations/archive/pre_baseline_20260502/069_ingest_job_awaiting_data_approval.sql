BEGIN;

DO $$
DECLARE
  status_attnum smallint;
  rec record;
BEGIN
  SELECT attnum INTO status_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ingest_job'::regclass
    AND attname = 'status'
    AND NOT attisdropped;

  IF status_attnum IS NOT NULL THEN
    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.ingest_job'::regclass
        AND c.contype = 'c'
        AND c.conkey = ARRAY[status_attnum]
    LOOP
      EXECUTE format('ALTER TABLE public.ingest_job DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.ingest_job
  ADD CONSTRAINT ingest_job_status_check
  CHECK (
    status IN (
      'PENDING',
      'RUNNING',
      'DONE',
      'FAILED',
      'CANCELLED',
      'SPLIT_DRAFT',
      'AWAIT_APPROVAL',
      'APPROVED',
      'REJECTED',
      'AWAITING_DATA_APPROVAL'
    )
  );

COMMIT;
