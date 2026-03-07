# Split Budget Recovery On-Call Runbook v1

Operational runbook for `CHAPTER_SPLIT_LLM` incidents where split returns `DONE` but `NEEDS_RETRY` because of budget preemption.

## Scope

In scope:
- Ops and diagnostics only.
- Root-cause class `BUDGET` and/or artifact `CHUNK_OVERSIZED`.
- Deterministic-only anchors policy.

Out of scope:
- No code changes.
- No manual split point editing.
- No change to artifact gate semantics.

## Operating Intent

Success criteria:
1. First retry moves `operational_state` from `NEEDS_RETRY` to `READY_FOR_ANALYSIS`.
2. `ARTIFACT_NOT_READY_CHUNK_OVERSIZED` disappears, or `oversized_count` drops clearly.
3. No runaway retry loop and no abnormal p95 latency jump.

Non-goals:
1. Do not manually inject split points.
2. Do not switch off artifact hard gate.
3. Do not use `auto_recovery_transport` for budget-preempt fingerprints.

## Runtime Signals (Pre-Retry Checklist)

Config preflight (must pass before triage):
1. Ensure `LLM_COOL_OFF_SECONDS` is defined exactly once in env.
2. Ensure split timeout baseline is explicit and effective:
- `LLM_TIMEOUT_SPLIT=180` for this runbook profile.
3. Ensure no stale override lowers split phase budgets unexpectedly (`SPLIT_*_BUDGET_SEC`).

Required fields:
1. `split_runtime.phase_stop_reason`
2. `split_runtime.stop_reason`
3. `split_runtime.degrade_path_taken`
4. `split_runtime.degrade_reason_code`
5. `split_runtime.recovery_reason_codes`
6. `analysis_chunk_artifact.status`
7. `analysis_chunk_artifact.diagnostics.oversized_count`
8. `analysis_chunk_artifact.violations`
9. `split_runtime.phase_budget` and `split_runtime.phase_timing`
10. `split_runtime.repair_summary`

Budget-preempt fingerprint (strong match):
1. `phase_stop_reason` contains `PRIMARY_BUDGET_EXCEEDED`, or
2. `stop_reason == TIME_BUDGET_PREEMPTED`, or
3. `degrade_reason_code == BUDGET_DEGRADE_PATH_TAKEN`,
4. and artifact violations include `CHUNK_OVERSIZED`.

## Retry Policy Matrix

### Case A: Root cause `BUDGET` (primary path)
Action:
1. Run Smart Retry with profile `auto_recovery_budget`.

Expected runtime after retry:
1. `retry_profile_effective = auto_recovery_budget`.
2. `phase_budget.total_budget_sec` uses recovery uplift for long chapter.
3. `recovery_path_mode` is valid (`explicit_profile` or `guard_forced`).
4. `split_runtime.repair_summary.attempted` is expected to be `true` in most recoverable oversized cases.

### Case B: Root cause `ARTIFACT` but budget-preempt fingerprint exists
Action:
1. Still use `auto_recovery_budget`.

Rationale:
1. Oversized artifact is a downstream effect of budget preemption.

### Case C: True transport/LLM health issue (no budget-preempt fingerprint)
Action:
1. Use `auto_recovery_transport` generic runbook.

## Deterministic-Only Anchor Policy

Allowed:
1. Use `anchor_mode`, `anchor_stats`, `anchor_enforcement` for diagnostics.
2. Track `ANCHOR_MISS_TEMPORAL` and `ANCHOR_MISS_LOCATION` in `reason_codes`.

Not allowed:
1. Do not pass manual `hard_anchor_positions` in payload/split controls.
2. Do not manually adjust scene boundaries in UI.

## Incident Procedure (Per Task)

1. Confirm fingerprint:
- budget-preempt plus oversized artifact.
2. Select retry profile:
- force `auto_recovery_budget`.
3. Run exactly one Smart Retry.
4. Review retry output:
- `operational_state`, `analysis_chunk_artifact.status`.
- `oversized_count`, `violations`.
- `split_runtime.repair_summary.attempted`.
- `split_runtime.recovery_reason_codes`.
5. Decide:
- If `READY_FOR_ANALYSIS`: close incident.
- If still `NEEDS_RETRY` but `oversized_count` reduced: allow one more retry.
- If no improvement after two retries: escalate.

## Escalation Rules

Escalate immediately if any:
1. p95 split duration increases more than 20% for 2 consecutive days.
2. `RECOVERY_PATH_NOT_ENOUGH_BUDGET` repeats on same chapter after 2 retries.
3. `repair_summary.attempted` stays `false` after budget recovery retries.
4. New crash class appears (not budget preemption).

Escalation packet must include:
1. Full task payload and result JSON.
2. `phase_budget` vs `phase_timing`.
3. `analysis_chunk_artifact.diagnostics`.
4. `reason_codes` and `recovery_reason_codes`.
5. `retry_profile_used` and `retry_profile_effective`.

## KPIs and Alert Thresholds

Track:
1. `needs_retry_rate` for budget cohort.
2. `artifact_not_ready_chunk_oversized_rate` after first retry.
3. `budget_degrade_path_taken_rate`.
4. `RECOVERY_PATH_NOT_ENOUGH_BUDGET` frequency.
5. `repair_summary.attempted=true` ratio in budget-retry cohort.
6. `anchor_miss_rate_temporal` and `anchor_miss_rate_location`.

Alert when:
1. `RECOVERY_PATH_NOT_ENOUGH_BUDGET` spikes versus prior baseline.
2. Budget cohort first-retry success drops materially week-over-week.

## Interfaces and Payload Notes (Ops-facing)

No endpoint changes are required. Use these runtime fields for diagnosis:
1. `split_runtime.retry_profile_effective`
2. `split_runtime.budget_recovery_guard_applied`
3. `split_runtime.budget_recovery_guard_reason`
4. `split_runtime.recovery_path_mode`
5. `split_runtime.anchor_*`

## Verification Checklist (Ops + QA)

1. Reproduce one long-chapter budget-preempt case.
2. Retry with `auto_recovery_budget`.
3. Verify:
- `retry_profile_effective=auto_recovery_budget`.
- `analysis_chunk_artifact.status=READY_FOR_ANALYSIS` or oversized reduced clearly.
- `operational_state` matches artifact status.
- `split_runtime.repair_summary.attempted=true` where oversized chunk remediation is expected.
4. Regression check:
- Non-budget incidents still use transport/artifact flows correctly.

## Defaults and Assumptions

1. Budget preemption is the main source of oversized artifact in this cohort.
2. Deterministic anchor extraction is enabled and stable enough for ops workflow.
3. Max two retries per chapter before escalation.
4. Core split algorithm is unchanged in this phase.
