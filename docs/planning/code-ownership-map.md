# Code Ownership Map

Status: Active reference
Last updated: 2026-05-26

This map gives agents a first-pass ownership view. It does not replace source inspection.

| Area | Owner boundary | Primary paths |
|---|---|---|
| App routes and API handlers | Next.js route parsing, page entry, thin API route handlers | `apps/studio/src/app/` |
| Studio shell and story selector | Layout shell, selected story navigation, top-level story context | `apps/studio/src/components/`, `apps/studio/src/features/story/` |
| Write workspace | Chat-first command stream, artifact panel, inspector rail, chapter controls | `apps/studio/src/features/scenes/components/writeTab/` |
| Chat orchestration | Intent routing, timeline blocks, command handlers, conversation persistence | `apps/studio/src/features/scenes/components/writeTab/chatOrchestration/`, `apps/studio/src/features/chat-orchestration/` |
| Scenes workflow | Story-scoped scene/chapter workflow routes and server orchestration | `apps/studio/src/features/scenes/server/` |
| Memory and context | Story memory, context retrieval, core memory, conflict review | `apps/studio/src/features/memory/`, `services/memory-bridge/` |
| Ingest | Upload validation, source docs, split drafts, worker interaction | `apps/studio/src/features/ingest/`, `services/memory-bridge/worker_ingest*` |
| Reviews | Review request/response UI and server policy | `apps/studio/src/features/reviews/` |
| DB schema | Durable data contracts and migrations | `db/migrations/` |
| Local infrastructure | PostgreSQL, Qdrant, Neo4j, historian bridge, Studio container | `infra/docker-compose.yml` |
| E2E | Playwright specs, fixtures, helpers, and local stack startup | `apps/studio/e2e/`, `apps/studio/playwright.config.ts`, `scripts/ops/start_e2e_stack.sh` |
| Agent harness | Agent entrypoint, operating layer, prompt router, runtime skills, reports, session hooks | `AGENTS.md`, `.agents/`, `scripts/ops/agent-session-*.sh` |
