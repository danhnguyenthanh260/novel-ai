---
name: user-journey-product-review
description: Use when a user-facing UI/product prompt needs journey simulation, user critique, short/long content pressure review, or an issue-ready product report before implementation.
---

# User Journey Product Review

## Purpose

Turn vague UI/product dissatisfaction into an evidence-backed journey report
before implementation. This skill helps an agent understand the human intent,
the product surface, the content pressure, and the decision points before
writing code, creating issues, or changing the harness.

Use this after `.agents/workflows/prompt-universe.md` routes a prompt into
`journey-first`.

## Trigger Conditions

Use this skill when the task mentions:

- UI quality, product flow, UX, journey, usability, or "make this better".
- A request to act as the user, reviewer, product owner, or tester.
- Short versus long content behavior.
- Writing a report, ticket, issue, acceptance criteria, or product critique.
- User-facing Write workspace changes where static layout checks are not enough.

Combine with surface skills when needed:

- `chat-first-workspace` for composer, timeline, slash commands, and chat state.
- `codex-style-layout-review` for pane layout, viewport, scroll, and responsive behavior.
- `artifact-context-contract` for generated prose, document artifacts, approval, and right-panel behavior.
- `long-text-ingestion` for pasted prose, uploads, source docs, and split flows.
- `playwright-e2e-verification` when browser-level proof is required.

## Required Investigation Steps

1. Read `AGENTS.md`.
2. Read `.agents/workflows/prompt-universe.md` to preserve router boundaries.
3. Read `apps/studio/README.md` when the journey touches Studio behavior.
4. Read the relevant surface skill before inspecting implementation files.
5. Inspect only the files, docs, screenshots, or reports directly related to the journey.

## Journey Simulation

Act as the target user before proposing implementation:

1. Define the user:
   - first-time author
   - returning author
   - reviewer/editor
   - operator/tester
2. Define the user's intent:
   - what they are trying to finish in one sitting
   - what success looks like to them
   - what they likely do next if the UI blocks them
3. Walk concrete actions:
   - first open
   - short input, such as one sentence, one command, or one small choice
   - long input, such as pasted prose, an outline, a chapter draft, or dense review output
   - system response
   - result inspection
   - edit, retry, approval, or next action
4. Review state coverage:
   - empty
   - loading
   - degraded
   - blocked
   - error
   - success
   - retry or recovery
5. Review content pressure:
   - short text must not create a wasteful oversized surface
   - long text must not become a giant chat bubble
   - dense metadata must stay scannable
   - generated prose must belong in artifact/document space
   - the primary next action must remain visible
6. Review responsive pressure:
   - desktop with left, center, and right panes
   - narrow width with intentional secondary-surface collapse
   - mobile fallback where the primary task remains usable

## Output Contract

For investigation or planning, return:

- `User intent`: who the user is and what they want to finish.
- `Journey map`: concrete user actions and system responses.
- `Short-content behavior`: how the UI behaves for small prompts or short results.
- `Long-content behavior`: how the UI behaves for pasted prose, generated prose, or dense analysis.
- `State coverage`: empty, loading, degraded, blocked, error, success, and retry.
- `User critique`: plain-language comments from the user's point of view.
- `Decision points`: product, workflow, content ownership, or information architecture choices that need approval.
- `Recommended skill route`: exact `.agents/skills/*` files to use next.
- `Ticket/report`: issue-ready scope, acceptance criteria, file manifest, risks, and verification gates if implementation is not already approved.

For approved implementation, the journey map becomes input to the file manifest.
If the journey exposes an unapproved product or workflow decision, stop and ask
the user before coding.

## Guardrails

- Do not use this skill as a substitute for source inspection.
- Do not invent product decisions when the user has not approved them.
- Do not create decorative UI recommendations that conflict with the existing
  utilitarian Write workspace.
- Do not turn full prose, imports, or analysis reports into chat bubbles.
- Do not create GitHub issues until the issue scope and acceptance criteria are
  clear.

## Verification

For docs-only journey reports:

```bash
git diff --check
```

For UI implementation that follows this review, use the verification gates from
the selected surface skills and `AGENTS.md`.
