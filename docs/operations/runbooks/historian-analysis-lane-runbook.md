# Historian Analysis Lane Runbook

## Purpose

Operate and triage the dedicated `WRITING_ANALYSIS` lane while keeping split/writing flows independent.

## Runtime Model

Run 3 worker lanes in parallel:

1. `split` lane for ingest split tasks.
2. `analysis` lane for `WRITING_ANALYSIS`.
3. `writing` lane for narrative/writing tasks.

## Start/Stop Commands

From repo root:

```bash
./scripts/ops/run_worker_lanes.sh
```

Start only analysis lane:

```bash
./scripts/ops/run_worker_lane.sh analysis
```

Stop all lanes:

```bash
./scripts/ops/stop_worker_lanes.sh
```

## Health Checks

1. Process health:
```bash
ps -ef | grep memory_bridge_worker.py | grep -v grep
```

2. Lane logs:
```bash
tail -n 80 .runtime/memory_worker_analysis.log
```

3. Event lane coverage:
```sql
SELECT flow_type, status, COUNT(*)::int AS n
FROM public.pipeline_node_event
WHERE created_at >= now() - interval '24 hours'
GROUP BY 1,2
ORDER BY 1,2;
```

Expected: `WRITING_ANALYSIS` appears separately from `AUTOWRITE` and `INGEST_SPLIT`.

## SLO Targets

1. Analysis p95 latency < 30s.
2. Degraded mode rate < 5% (alert if >= 10%).
3. Hydration coverage = 100% for `WRITING_ANALYSIS` DONE runs.

Use:

- [historian-analysis-observability-panels.sql](/home/danh/novel-ai/docs/operations/observability/historian-analysis-observability-panels.sql)

## Triage Guide

1. High degraded mode:
- Check `LLM_TIMEOUT_WRITING_ANALYSIS`, `LLM_TIMEOUT_HISTORIAN_QDRANT`, `LLM_TIMEOUT_HISTORIAN_NEO4J`.
- Check `HISTORIAN_MCP_BASE_URL` health (`/healthz`).
- If adapters fail, keep fail-open but disable unstable adapter flag temporarily.

2. Conflict spike (`CONFLICT` / `LINEAGE_CONFLICT_GRAPH`):
- Verify Postgres ground truth rows first.
- Confirm Neo4j lineage data freshness.
- If graph stale: refresh graph ingest; do not overwrite Postgres automatically.

3. Missing hydration logs:
- Verify `AGENT_TRACE_STORE_PROMPT_TEXT` policy (hash still required).
- Query `agent_run_trace` and `agent_prompt_hydration_trace` join for gaps.

## Rollback

If analysis lane causes instability:

1. Stop only analysis lane:
```bash
./scripts/ops/stop_worker_lanes.sh
./scripts/ops/run_worker_lane.sh split
./scripts/ops/run_worker_lane.sh writing
```

2. Optional temporary bypass:
- Disable adapters with `HISTORIAN_QDRANT_ENABLED=0` and/or `HISTORIAN_NEO4J_ENABLED=0`.
- Keep `WRITING_ANALYSIS` running Postgres-first mode.
