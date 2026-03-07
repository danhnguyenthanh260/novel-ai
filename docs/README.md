# Docs Index

Tai lieu duoc nhom theo taxonomy de de tim va giam trung lap.

## Folders

- `docs/architecture/`: architecture contract va boundary reference.
- `docs/operations/`: deploy, migration runbook, observability queries.
- `docs/planning/`: reorg plans, baseline, checklist, verification snapshots.
- `docs/benchmarks/`: benchmark process va baseline reports.

## Quick Links

- Business Handbook:
  - [system-business-handbook.md](./operations/specs/system-business-handbook.md)
- Operations Specs:
  - [pipeline-first-ia-spec.md](./operations/specs/pipeline-first-ia-spec.md)
  - [agent-governance-ux-evolution-v1.md](./operations/specs/agent-governance-ux-evolution-v1.md)
- Implementation & Rollout:
  - [ingest-proactive-rollout-master.md](./operations/implementation/ingest-proactive-rollout-master.md)
  - [pipeline-first-execution-checklist.md](./operations/implementation/pipeline-first-execution-checklist.md)
  - [agent-evolution-rollout-checklist.md](./operations/implementation/agent-evolution-rollout-checklist.md)
  - `docs/operations/pipeline-node-triage-runbook.md`
  - `docs/operations/runbooks/split-budget-recovery-oncall-runbook.md`
  - `docs/operations/writing-production-readiness-plan.md`
  - `docs/operations/writing-observability-runbook.md`
  - `docs/operations/writing-rollout-canary-runbook.md`
  - [ingest-proactive-rollout-master.md](./operations/implementation/ingest-proactive-rollout-master.md#section-4-validation--guardrails) (Split Guardrail)
  - `docs/operations/weekly-review/`
  - `docs/operations/observability/grafana-memory-retention-panels.sql`
  - `docs/operations/observability/grafana-self-healing-panels.sql`
  - `docs/operations/observability/writing-observability-panels.sql`
  - `docs/operations/split-feedback-insights/`
  - `docs/operations/supervisor-casebook/`
- Planning:
  - `docs/planning/code-ownership-map.md`
  - `docs/archive/2026-02/` (Historical planning)
- Runtime Config:
  - `services/memory-bridge/worker_runtime_config.py` (single source for worker timeouts/cool-off)
- Benchmarks:
  - `docs/benchmarks/split-benchmark.md`

## Path Mapping (old -> new)

- `docs/stage3_structure_contract.md` -> `docs/architecture/stage3_structure_contract.md`
- `docs/change-impact-map.md` -> `docs/architecture/change-impact-map.md`
- `docs/deploy-migrations.md` -> `docs/operations/deploy-migrations.md`
- `docs/grafana-memory-retention-panels.sql` -> `docs/operations/observability/grafana-memory-retention-panels.sql`
- `docs/grafana-self-healing-panels.sql` -> `docs/operations/observability/grafana-self-healing-panels.sql`
- `docs/split-benchmark.md` -> `docs/benchmarks/split-benchmark.md`
- `docs/code-ownership-map.md` -> `docs/planning/code-ownership-map.md`
- `docs/pipeline-plan.md` -> `docs/planning/pipeline-plan.md`
