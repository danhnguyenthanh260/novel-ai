# Change Impact Map

Status: Active reference
Last updated: 2026-05-26

This map helps agents identify which source-of-truth files to inspect before changing a surface. It is intentionally compact; detailed contracts live in the linked docs and skills.

| Change surface | Read first | Common files |
|---|---|---|
| Agent harness, skills, docs drift | `AGENTS.md`, `.agents/README.md`, `.agents/workflows/prompt-universe.md`, `.agents/skills/agent-harness-consistency-pass/SKILL.md` | `.agents/skills/*/SKILL.md`, `.agents/workflows/*`, `.agents/maintenance.md`, `.agents/reports/*` |
| Write chat, composer, slash commands | `.agents/skills/chat-first-workspace/SKILL.md`, `docs/operations/specs/studio-chat-orchestration-layer.md` | `apps/studio/src/features/scenes/components/writeTab/CommandWorkStream.tsx`, `apps/studio/src/features/scenes/components/writeTab/chatOrchestration/*` |
| Write layout and inspector | `.agents/skills/codex-style-layout-review/SKILL.md`, `apps/studio/README.md` | `NovelLabWorkspace.tsx`, `ArtifactSurface.tsx`, `ArtifactInspectorRail.tsx` |
| Artifact contracts | `.agents/skills/artifact-context-contract/SKILL.md` | `apps/studio/src/features/scenes/components/writeTab/types.ts`, `TimelineBlocks.tsx`, `ArtifactSurface.tsx` |
| Workflow progress | `.agents/skills/agent-progress-panel/SKILL.md` | `workflowProgressEvents.ts`, `TimelineBlocks.tsx`, `ArtifactInspectorRail.tsx` |
| Long text ingestion | `.agents/skills/long-text-ingestion/SKILL.md`, `apps/studio/README.md` ingest section | `apps/studio/src/features/ingest/*`, `services/memory-bridge/*` |
| Story context and memory | `.agents/skills/story-context-grooming/SKILL.md`, `docs/architecture/writing-context-contract.md` | `apps/studio/src/features/memory/*`, `services/memory-bridge/worker_memory_*` |
| Chapter generation | `.agents/skills/chapter-generation-workflow/SKILL.md`, `docs/architecture/chapter_first_v3_spec.md` | `services/memory-bridge/worker_chapter_writer.py`, `apps/studio/src/features/scenes/server/workflow/*` |
| Playwright E2E | `.agents/skills/playwright-e2e-verification/SKILL.md` | `apps/studio/playwright.config.ts`, `apps/studio/e2e/*`, `scripts/ops/start_e2e_stack.sh` |
| DB contracts | `db/migrations/*.sql`, relevant architecture docs | `db/migrations/*`, `services/memory-bridge/*`, server repos |

Rules:

- Read `AGENTS.md` before repo work.
- Read `apps/studio/README.md` when product architecture or workflow behavior is involved.
- Use the relevant skill, but verify actual paths before editing.
- If this map becomes stale, update it in the same PR as the convention change.
