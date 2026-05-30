# Prompt Universe Router

Status: Active workflow intake router
Last updated: 2026-05-30

## Purpose

Use this workflow when a user gives a raw, vague, multi-intent, or high-context prompt and the right repo skill is not obvious.

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
   - UI/product journey review
   - harness/docs/skills maintenance
5. Select the smallest relevant skill set from `.agents/skills/`.
6. Identify source-of-truth files, likely files to change, risks, and verification before editing.
7. Decide whether the task is actionable, blocked, or needs user context.
8. Stop for a decision if the prompt requires an unapproved product, architecture, data model, workflow, or issue-planning decision.

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
| User-facing UI, product flow, vague "make this better", or UX complaint | Start with the UI/Product Journey Lens below, then choose `chat-first-workspace`, `codex-style-layout-review`, `artifact-context-contract`, `long-text-ingestion`, or `playwright-e2e-verification` as needed |

Use multiple skills only when the prompt crosses surfaces. Prefer the minimal set that covers the actual task.

## UI/Product Journey Lens

Use this lens before implementation when a prompt touches a user-facing surface,
UI quality, interaction design, information density, writing flow, or vague
product improvement such as "make this better", "UI is bad", "fix the
experience", or "upgrade the workspace".

This lens is mandatory for Novel Lab Write workspace UI work because a layout
can pass static checks while still failing the author's actual writing journey.

### Required Simulation

Act as a real target user before proposing files or code:

1. Define the user and intent:
   - first-time author, returning author, reviewer, or operator
   - what they are trying to finish in one sitting
2. Walk the journey as user actions:
   - first open
   - short input, for example one sentence or one command
   - long input, for example pasted prose, outline, chapter draft, or dense review
   - system response
   - recovery after missing context, blocked state, error, or empty state
   - result inspection, edit, approval, or next action
3. Test content pressure:
   - short text must not create empty oversized UI
   - long text must not become unreadable, overflow, or bury the composer
   - generated prose must not appear as a giant chat bubble
   - dense metadata must be scannable without turning the workspace into cards inside cards
4. Check responsive pressure:
   - desktop with left, center, and right panes
   - narrow width where secondary panes collapse or move intentionally
   - mobile fallback where the center task stays usable
5. Write the user's critique in plain language:
   - what feels clear
   - what feels confusing
   - what blocks progress
   - what the user would try next

### Journey Output Contract

For UI/product investigation or planning, return:

- `User journey`: concrete steps and user intent.
- `Short-content behavior`: what happens with a small prompt or short result.
- `Long-content behavior`: what happens with long pasted text, generated prose, or dense analysis.
- `State coverage`: empty, loading, degraded, blocked, error, success, and retry states.
- `User critique`: first-person or reviewer-style comments grounded in the journey.
- `Skill route`: exact `.agents/skills/*` files to use next.
- `Ticket/report`: if work is not immediately approved, write an issue-ready report with scope, acceptance criteria, file manifest, risks, and verification gates.

For approved implementation, include the journey in the file-change plan before
editing. If the journey exposes a product or workflow decision, classify the
task as `decision-needed` and stop for the user.

## Actionability States

After routing, classify the prompt as one of:

| State | Meaning | Agent action |
|---|---|---|
| `actionable` | Scope, source files, and verification gates are clear enough. | Proceed with the smallest relevant skill set. |
| `investigate-first` | Symptom is real but root cause or surface is unclear. | Use `investigation-workflow` and report evidence before changing code. |
| `plan-first` | User asked for a plan, issue body, file manifest, or sequencing. | Use `implementation-planning`; do not code unless the user approves implementation. |
| `journey-first` | User-facing UI quality is unclear, subjective, or likely to fail under real content. | Use the UI/Product Journey Lens before writing an implementation plan or code. |
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

- implementation map
- user journey and product critique when UI or workflow is involved
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
