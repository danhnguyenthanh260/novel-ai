# Historian V3 Reliability Runbook

## Purpose

Operate `WRITING_ANALYSIS` safely with reliability-first gates before enabling full Historian V3 quality features.

## Preflight Checklist

1. `analysis` lane is running.
2. Llama process is running (single instance).
3. LLM HTTP health is ready (`/health` returns OK).
4. Migrations `063-068` are applied in target DB.

If any check fails, chapter analysis must not be enqueued.

## Runtime Safeguards

1. `ANALYSIS_PREFLIGHT_STRICT=1` keeps chapter analysis blocked until preflight passes.
2. Stale `RUNNING` tasks are auto-failed as:
   - `FAILED_STALE:WRITING_ANALYSIS:...`
   - `FAILED_STALE:MEMORY_ROLLUP:...`
3. Llama start is idempotent:
   - checks PID file
   - checks existing process by port
   - checks health endpoint to avoid duplicate spawn.

## Tuning

1. `LLM_TIMEOUT_WRITING_ANALYSIS` controls analysis LLM timeout.
2. `ANALYSIS_STALE_TIMEOUT_MULTIPLIER` controls stale threshold for analysis.
3. `MEMORY_ROLLUP_STALE_TIMEOUT_MULTIPLIER` controls stale threshold for rollup.
4. `WRITING_ANALYSIS_MAX_TOKENS` caps extraction response size.

## Go / No-Go Operational Gates

1. Go:
   - `WRITING_ANALYSIS` DONE rate stable.
   - timeout/stale rate trending down.
   - no EPHEMERAL leak into static/global facts.
2. No-Go:
   - repeated stale failures.
   - LLM health flaps causing queue growth.
   - entity conflict/leak above policy threshold.

## Recovery Steps

1. Restart `analysis` lane worker.
2. Ensure only one llama process on configured port.
3. Re-run failed chapter analysis after health is green.
4. If failures continue:
   - reduce context/prompt volume,
   - lower concurrency to single lane,
   - inspect `memory_worker_analysis.log` and `llama_server.log`.
