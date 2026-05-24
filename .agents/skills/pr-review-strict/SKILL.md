---
name: pr-review-strict
description: Use when reviewing a PR, branch diff, local diff, or code change in novel-ai for correctness, UX regressions, data contract regressions, responsiveness, accessibility, tests, overengineering, and unintended scope creep.
---

# PR Review Strict

## Trigger Conditions

Use this skill when the user asks for:

- PR review
- diff review
- code review
- "check this branch"
- "review changes"
- "find blockers"

## Goal

Review like a strict maintainer. Findings come first, ordered by severity, with exact file/line references where possible. Focus on bugs, regressions, missing tests, scope creep, and contract violations.

## Required Investigation Steps

1. Read `AGENTS.md`.
2. Inspect `git status --short --branch` and identify unrelated dirty files.
3. Inspect the diff under review only:
   - `git diff --stat`
   - `git diff -- <relevant paths>`
   - PR base/head diff if reviewing a PR
4. Read directly related contracts/docs:
   - `apps/studio/README.md` for UI/workflow behavior
   - `docs/operations/specs/studio-chat-orchestration-layer.md` for chat timeline
   - `docs/architecture/writing-context-contract.md` for context behavior
   - `docs/architecture/document-editor-boundary.md` for draft/approval behavior
5. Run tests only if the user asks or review scope includes verification and it is safe to run them.

## Review Rules

- Findings first. No long summary before findings.
- Severity order: Blocker, High, Medium, Low.
- Each finding needs file and line where possible.
- Explain the concrete failure mode and why it matters.
- Separate code correctness from UX, data contract, responsiveness, accessibility, and test coverage.
- Call out unintended scope changes, unrelated refactors, or behavior changes not supported by the task.
- If no issues are found, say so clearly and mention remaining test gaps or residual risk.

## Forbidden Actions

- Do not fix code during a review unless the user asks to address findings.
- Do not review generated/build artifacts unless they are part of the requested change.
- Do not claim a command passed without running it.
- Do not approve hidden canon mutation, memory promotion, publishing, or destructive DB behavior without explicit gates.
- Do not treat broad lint noise as a finding unless it is introduced by the diff or blocks verification.

## Output Format

Use this shape:

```text
Findings
- [Blocker] file:line - issue and failure mode.
- [High] file:line - issue and failure mode.
- [Medium] file:line - issue and failure mode.

Open Questions
- ...

Verification
- Ran: ...
- Not run: ...

Summary
- Brief context only after findings.
```

If there are no findings:

```text
Findings
- No blocking correctness issues found.

Verification
- ...

Residual Risk
- ...
```

## Verification Requirements

- Prefer targeted commands tied to changed files.
- For `apps/studio` code, use `npm run typecheck`, `npm run build` when feasible, and `npx eslint <changed-files>`.
- For Python worker changes, use targeted `python3 -m unittest ...` and `python3 -m py_compile <changed-files>`.
- For DB changes, inspect migration reversibility and run local SQL only when environment and user intent are clear.

## Edge Cases

- Existing dirty worktree: identify unrelated changes and keep review scoped.
- UI diff: check viewport containment, independent scroll regions, text fit, accessibility labels, and artifact/chat ownership.
- Context/writing diff: check readiness, source trace, degraded/block behavior, and fallback strictness.
- Chat diff: check composer draft persistence, structured choices, and backend block source ownership.
