-- Migration 061: extend pipeline_node_event flow_type contract
-- Add WRITING_ANALYSIS as a first-class lane in pipeline events.

ALTER TABLE public.pipeline_node_event
  DROP CONSTRAINT IF EXISTS pipeline_node_event_flow_type_check;

ALTER TABLE public.pipeline_node_event
  ADD CONSTRAINT pipeline_node_event_flow_type_check
  CHECK (
    flow_type IN ('INGEST_SPLIT', 'REPROCESS_SPLIT', 'AUTOWRITE', 'WRITING_ANALYSIS')
  );
