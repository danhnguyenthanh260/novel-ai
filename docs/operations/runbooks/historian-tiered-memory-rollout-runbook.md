# Historian Tiered Memory Rollout Runbook (2026-02-26)

## Scope

Runbook for:

1. `MEMORY_ROLLUP` execution
2. Coverage threshold policy checks (`batch|arc|story`)
3. Go/No-Go metric verification
4. Incident triage for approval lane

## Preconditions

1. Migrations applied: `063`, `064`, `065`, `066`.
2. Worker process running and consuming `MEMORY_ROLLUP`.
3. Analysis lane has approved chapter snapshots.

## Coverage Threshold Policy

Config via env:

1. `HISTORIAN_COVERAGE_THRESHOLD_BATCH` (default `1.0`)
2. `HISTORIAN_COVERAGE_THRESHOLD_ARC` (default `1.0`)
3. `HISTORIAN_COVERAGE_THRESHOLD_STORY` (default `0.9`)

Policy:

1. Aggregate coverage ratio = `approved / total`.
2. `ready_for_writing=true` only when ratio >= threshold.
3. Else mark `INCOMPLETE_COVERAGE`.

## MEMORY_ROLLUP Procedure

1. Trigger aggregate analysis (`chapter_range|arc|story`) in Analysis Console.
2. System auto-queues `MEMORY_ROLLUP` task.
3. Validate task result contains:
   - `source_snapshot_ids`
   - `coverage`
   - `quality_score`
4. Validate milestone written in `public.story_milestone`.

## Go/No-Go API Check

Endpoint:

1. `GET /api/stories/{slug}/analysis/metrics?days=7`

Expected:

1. `entity_accuracy >= 0.95`
2. `ephemeral_leak_count = 0`
3. `p95_latency_sec` inside your baseline gate

Note:

1. `prompt_token_reduction_pct` may be unavailable until token baseline instrumentation is added.

## Incident Triage

1. Symptom: aggregate stuck `INCOMPLETE_COVERAGE`
   - Check missing chapter ids in folder coverage.
   - Approve required chapter snapshots.
2. Symptom: `MEMORY_ROLLUP` done but no milestone
   - Inspect worker logs for task payload parsing.
   - Re-run rollup task for same scope.
3. Symptom: writer context has no historian guidance
   - Confirm active approved snapshot exists in `story_active_analysis_snapshot` or approved `story:all` scope snapshot.

## Rollback

1. Revert threshold envs to stricter values (`1.0`).
2. Cancel problematic aggregate snapshots.
3. Re-approve last known good snapshot per scope.

