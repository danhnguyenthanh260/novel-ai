# Prompt Universe Router

Status: Active workflow intake router
Last updated: 2026-05-30

## Purpose

Use this workflow when a user gives a raw, vague, multi-intent, or high-context prompt and the right repo skill is not obvious.

This file is an intake router. It does not contain domain-specific review
rubrics. It decides what the user likely means, which context is missing, which
repo/human decision is needed, and which skill should own the next step before
any serious investigation, issue work, or implementation begins.

When the user explicitly tags this file or says to use `prompt-universe`, treat
the first response as a prompt interpretation pass for human review. Write that
pass in the user's language. Keep it close, concrete, and clear; explain terms
or ambiguous wording only where it prevents misunderstanding.

This is the router for the existing `novel-ai` agent harness. It is not a new
capability layer, and it must not create parallel trees such as `.ai/skills`,
`.ai-harness`, `docs/agent-skills`, or `docs/ai-layer`.

## Source Of Truth

- Current checkout, GitHub issues/PRs, and repo docs are source of truth.
- Local Codex, Claude, or desktop memory is cache only. Verify memory-derived claims against live files or GitHub state before acting.
- Agent instructions start in `AGENTS.md`.
- The single agent operating layer is `.agents/`.
- Runtime skills live under `.agents/skills/`.
- Harness specs, workflows, maintenance rules, reports, agent profiles, and agent-only scripts live under `.agents/`.
- Product architecture and workflow behavior live in `apps/studio/README.md`.
- Product architecture and system contracts live under `docs/`.

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
5. Resolve user intent and context:
   - what the user is trying to achieve
   - which repo surface, product journey, or operational workflow is involved
   - whether the user wants investigation, planning, implementation, review,
     GitHub work, or a decision memo
   - what assumptions would be dangerous to encode
   - what the user likely expects from prior repo context, issues, PRs, or
     recent decisions
6. Select the smallest relevant skill set from `.agents/skills/`.
7. Identify source-of-truth files, likely files to change, risks, and verification before editing.
8. Decide whether the task is actionable, blocked, or needs user context.
9. Stop for a decision if the prompt requires an unapproved product, architecture, data model, workflow, or issue-planning decision.

## Skill Routing

| Prompt shape | Use |
|---|---|
| Unclear root cause, regression, data inconsistency, or unclear behavior | `investigation-workflow` |
| User asks for an execution plan, issue plan, or file manifest | `implementation-planning` |
| User asks to review a proposed plan or issue body | `implementation-plan-review` |
| Code organization, module boundaries, naming conventions, line budgets, file splitting, or repo-wide coding standards | `implementation-planning`, then add the relevant surface skill such as `frontend-code`, `chat-first-workspace`, or `chapter-generation-workflow` |
| User asks for issues, branches, commits, PRs, or staging publish flow | `github-issue-pr-workflow` |
| User asks for PR/local diff review | `pr-review-strict` |
| Write Assistant, chat timeline, composer, slash commands, story switching | `chat-first-workspace` |
| Story memory, context gaps, source traceability, context grooming | `story-context-grooming` |
| Review generated chapter vs canon, audit memory extraction is clean, "is chapter N publishable", "why did writing drift" | `memory-integrity-review` |
| Author style, narrative coherence, long-fiction continuity, timeline consistency, scientific paper research for writing workflows | `narrative-style-continuity-research`, then add `story-context-grooming`, `chapter-generation-workflow`, or `long-text-ingestion` as needed |
| Chapter planning, AutoWrite, CHAPTER_WRITE_V3, generation status | `chapter-generation-workflow` |
| Progress/thinking cards, workflow progress, right inspector status | `agent-progress-panel` |
| Artifacts, context digest, artifact preview, approval display | `artifact-context-contract` |
| User-facing journey, UX/product critique, unclear "make this better", or writing an issue-ready product report | `user-journey-product-review`, then add surface skills such as `chat-first-workspace`, `codex-style-layout-review`, `artifact-context-contract`, or `long-text-ingestion` |
| Triple-pane layout, viewport locking, independent scroll, responsive fallback | `codex-style-layout-review` |
| Pasted/uploaded long text, mega files, ZIP imports, source docs | `long-text-ingestion` |
| Browser, Playwright, E2E service requirements, layout verification | `playwright-e2e-verification` |
| AGENTS/docs/skills/E2E drift or harness consistency | `agent-harness-consistency-pass` |
| "đúc kết session", consolidate/distill a session into updated skills + memory + harness report + issues | `session-retrospective` |

Use multiple skills only when the prompt crosses surfaces. Prefer the minimal set that covers the actual task.

## Intent Resolution

Before selecting skills, translate the user's raw wording into an execution
frame:

- `User wants`: the concrete outcome requested.
- `User context`: what the user likely cares about, for example fresh clone,
  author journey, reviewer confidence, GitHub metadata, or product direction.
- `Repo surface`: files, docs, services, UI areas, DB contracts, or GitHub
  objects likely involved.
- `Mode`: investigation, plan, implementation, review, E2E, GitHub workflow, or
  harness maintenance.
- `Decision risk`: assumptions that would change product behavior, workflow,
  data ownership, issue scope, or architecture.
- `Missing context`: the smallest question that would unblock the work if the
  task is not yet actionable.

Do not start serious work until this frame is clear enough to choose skills and
source-of-truth files.

## Human Review Pass

When the user asks for `prompt-universe`, return this review pass before doing
serious work unless the request is already explicit and low-risk:

- `Mình hiểu bạn muốn`: restate the intended outcome in the user's language.
- `Context mình đang dùng`: repo branch, issue/PR, file, report, screenshot,
  prior decision, or product surface that appears relevant.
- `Điểm dễ hiểu nhầm`: ambiguous words, overloaded terms, missing target, or
  assumptions that could send the agent down the wrong path.
- `Intent đã phân giải`: investigation, planning, implementation, review,
  GitHub workflow, E2E, harness maintenance, or decision memo.
- `Skill route`: exact skill or smallest skill set to use next.
- `Cần user quyết định không`: decision needed, context needed, blocked, or
  actionable.
- `Đề xuất thêm`: optional skill, harness, issue, or memory improvement if the
  prompt reveals a repeated pattern.

If the prompt is urgent or implementation-approved, keep the review pass short
and proceed only after the route, risk, and decision surface are clear.

## Semantic Clarification

Explain meaning only when it reduces risk:

- Clarify overloaded words such as "fix", "plan", "report", "skill", "UI",
  "harness", "router", "memory", or "context" in the current repo situation.
- Name the concrete object if possible: file, skill, issue, PR, workflow, user
  journey, DB surface, or UI surface.
- Ask one narrow question when missing context blocks progress.
- Do not ask broad questions when a reasonable, low-risk route is available.

## Repo Memory And Pattern Capture

Use local memory as a clue, not a source of truth. Verify memory-derived claims
against the current checkout, GitHub state, or repo docs before acting.

Suggest a memory or skill update when:

- the same misunderstanding appears more than once
- the user corrects the agent's interpretation of a repo concept
- a prompt-routing rule would prevent repeated drift
- a workflow decision should be remembered for future runs

Do not write memory unless the user explicitly asks for a memory update.
Prefer updating `.agents/skills/` or `.agents/workflows/` when the pattern is a
repo harness rule.

## Actionability States

After routing, classify the prompt as one of:

| State | Meaning | Agent action |
|---|---|---|
| `actionable` | Scope, source files, and verification gates are clear enough. | Proceed with the smallest relevant skill set. |
| `investigate-first` | Symptom is real but root cause or surface is unclear. | Use `investigation-workflow` and report evidence before changing code. |
| `plan-first` | User asked for a plan, issue body, file manifest, or sequencing. | Use `implementation-planning`; do not code unless the user approves implementation. |
| `journey-first` | User-facing flow or UI quality is unclear, subjective, or likely to fail under real user context. | Route to `user-journey-product-review`; this router only selects the skill and decision frame. |
| `decision-needed` | Work would encode a product, architecture, data, workflow, or issue-planning decision. | Stop and ask the user to decide, with evidence, recommendation, risk, and exact decision needed. |
| `context-needed` | Required files, repro steps, environment, expected behavior, credentials, or target issue/PR are missing. | Ask for only the missing context needed to proceed. |
| `blocked` | Required service, secret, branch state, dependency, or permission prevents progress. | Report the blocker, what was tried, and the next unblock action. |

## Stop Conditions

Stop and ask for human review when:

- The current checkout is stale, dirty in relevant files, or on the wrong branch.
- GitHub issues or PRs already cover the work and updating them may be better than creating new ones.
- The prompt would encode a new product, architecture, data model, or workflow decision.
- Required services, secrets, databases, or local LLMs are unclear.
- The task would create a duplicate docs taxonomy or parallel skill tree.
- The implementation scope cannot be expressed as specific files and verification gates.

Do not ask broad questions when a narrow one will unblock the task.

## Output Contract

For investigation-only tasks, return:

- prompt interpretation if `prompt-universe` was explicitly requested
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
