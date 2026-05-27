# Prompt Universe Router

Status: Active workflow intake router
Last updated: 2026-05-27

## Purpose

Use this workflow when a user gives a raw, vague, multi-intent, or high-context prompt and the right repo skill is not obvious.

This is a router for the existing `novel-ai` agent harness. It is not a new capability layer, and it must not create parallel trees such as `.ai/skills`, `.ai-harness`, or `docs/ai-layer`.

## Source Of Truth

- Current checkout, GitHub issues/PRs, and repo docs are source of truth.
- Local Codex, Claude, or desktop memory is cache only. Verify memory-derived claims against live files or GitHub state before acting.
- Agent instructions are in `AGENTS.md`.
- Runtime skills live under `.agents/skills/`.
- Product architecture and workflow behavior live in `apps/studio/README.md`.
- Harness specs and user-facing operating docs live under `docs/operations/`.

## Intake Protocol

1. Verify the repo root and Git state.
2. Read `AGENTS.md`.
3. If the task touches product architecture or workflow behavior, read `apps/studio/README.md`.
4. Classify the prompt into one or more modes:
   - investigation only
   - implementation planning
   - approved implementation
   - GitHub issue/PR workflow
   - strict review
   - E2E verification
   - harness/docs/skills maintenance
5. Select the smallest relevant skill set from `.agents/skills/`.
6. Identify source-of-truth files, likely files to change, risks, and verification before editing.
7. Stop for a decision if the prompt requires an unapproved product, architecture, data model, workflow, or issue-planning decision.

## Skill Routing

| Prompt shape | Use |
|---|---|
| Unclear root cause, regression, data inconsistency, or unclear behavior | `investigation-workflow` |
| User asks for an execution plan, issue plan, or file manifest | `implementation-planning` |
| User asks to review a proposed plan or issue body | `implementation-plan-review` |
| User asks for issues, branches, commits, PRs, or staging publish flow | `github-issue-pr-workflow` |
| User asks for PR/local diff review | `pr-review-strict` |
| Write Assistant, chat timeline, composer, slash commands, story switching | `chat-first-workspace` |
| Story memory, context gaps, source traceability, context grooming | `story-context-grooming` |
| Chapter planning, AutoWrite, CHAPTER_WRITE_V3, generation status | `chapter-generation-workflow` |
| Progress/thinking cards, workflow progress, right inspector status | `agent-progress-panel` |
| Artifacts, context digest, artifact preview, approval display | `artifact-context-contract` |
| Triple-pane layout, viewport locking, independent scroll, responsive fallback | `codex-style-layout-review` |
| Pasted/uploaded long text, mega files, ZIP imports, source docs | `long-text-ingestion` |
| Browser, Playwright, E2E service requirements, layout verification | `playwright-e2e-verification` |
| AGENTS/docs/skills/E2E drift or harness consistency | `agent-harness-consistency-pass` |

Use multiple skills only when the prompt crosses surfaces. Prefer the minimal set that covers the actual task.

## Stop Conditions

Stop and ask for human review when:

- The current checkout is stale, dirty in relevant files, or on the wrong branch.
- GitHub issues or PRs already cover the work and updating them may be better than creating new ones.
- The prompt would encode a new product, architecture, data model, or workflow decision.
- Required services, secrets, databases, or local LLMs are unclear.
- The task would create a duplicate docs taxonomy or parallel skill tree.
- The implementation scope cannot be expressed as specific files and verification gates.

## Output Contract

For investigation-only tasks, return:

- implementation map
- source-of-truth files
- risks
- exact files likely to change
- verification plan
- open decisions

For implementation-approved tasks, return:

- files changed
- checks run
- skipped checks and why
- behavior changed
- risks
- harness docs or skills that should be updated
