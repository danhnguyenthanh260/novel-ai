# Agent Harness User Guide

Issue: #171
Status: Active user guide
Last updated: 2026-05-26

## Using Codex In This App

When using the Codex desktop app, open the workspace at the real repo path:

```text
\\wsl.localhost\Ubuntu-24.04\home\danh\novel-ai
```

Then use prompts that explicitly choose investigation-only or implementation-approved mode.

## Fast Path For Future Sessions

Use this when opening Codex in the desktop app and you do not want to remember the whole harness:

```md
Use the Novel AI Agent Harness v1.

First verify this is the real repo:
\\wsl.localhost\Ubuntu-24.04\home\danh\novel-ai

Read:
- AGENTS.md
- .agents/workflows/prompt-universe.md if this prompt is vague, raw, or mixes multiple request types
- docs/operations/specs/novel-ai-agent-harness.md
- the relevant .agents/skills/*/SKILL.md for this task

Task:
[describe task]

Mode:
Investigation only first. Do not edit files until I approve the implementation plan.

Return:
- current implementation map
- source-of-truth files
- risks
- exact files likely to change
- verification plan
- harness docs or skills that may need updates
```

## Prompt-Universe Router

Use `.agents/workflows/prompt-universe.md` when you have a messy prompt, pasted context, or you are not sure which skill/mode applies.

```md
Use .agents/workflows/prompt-universe.md as the intake router.

Interpret this raw request before editing anything:
[paste request]

Return:
- recommended mode
- relevant .agents/skills
- source-of-truth files to inspect
- likely risks
- whether this needs human approval before implementation
```

When the investigation is acceptable, continue with:

```md
Approved. Implement the smallest safe change from the plan.

Preserve the chat-first contract.
Do not touch unrelated files.
Run relevant checks.
Report files changed, checks run, skipped checks and why, risks, and whether a harness doc or skill should be updated.
```

## Daily Startup

Terminal flow:

```bash
cd ~/novel-ai
git pull --rebase
git checkout -b docs/<issue-number>-short-slug
./scripts/ops/agent-session-start.sh
```

Codex app flow:

```md
Use the Novel AI Agent Harness v1.

Task:
[describe task]

Mode:
Investigation only. Do not edit code yet.
```

## Investigation Prompt

```md
Use the Novel AI Agent Harness v1.

Task:
[describe task]

Mode:
Investigation only. Do not edit code yet.

Scope:
[areas]

Rules:
- Verify repo root first.
- Read AGENTS.md.
- Read apps/studio/README.md if product/workflow behavior is involved.
- Use relevant .agents/skills.
- Return implementation map, source-of-truth files, risks, exact files likely to change, and test plan.
```

## Implementation Prompt

```md
Use the previous investigation report as source of truth.

Proceed with the smallest safe implementation from the approved plan.

Preserve chat-first UX.
Do not touch unrelated files.
Run relevant checks if feasible.
Return files changed, tests run, skipped tests and why, risks, and harness updates.
```

## E2E Prompt

```md
Use the Novel AI Agent Harness v1 and the playwright-e2e-verification skill.

Task:
[describe flow]

Mode:
E2E verification plan first. Do not start long-running services until the required services and commands are listed.

Return:
required services, exact commands, target specs, assertions, risks, and fallback manual checks.
```

## Session Review Prompt For Skill Improvements

Use this when a Codex/Claude session went wrong, missed context, used stale commands, or produced a useful new pattern. This is proposal-only. The agent must not edit skills yet.

```md
Use the Novel AI Agent Harness v1.

Task:
Review these session notes and propose improvements to the repo agent skills.

Mode:
Proposal only. Do not edit files yet.

Inputs:
[paste session summary, PR review notes, failure logs, or links]

Return:
1. Failure patterns
2. Evidence from the session
3. Current skill gap
4. Proposed skill change
5. Risk of overfitting
6. Validation task
7. Exact files that would change if approved
```

After human approval, use:

```md
Approved skill proposal:
[paste approved proposal]

Update only the approved docs or .agents/skills files.
Do not change product code.
Run docs checks.
Open a PR to staging.
```

## Review After Codex Finishes

Run or inspect:

```bash
git diff --stat
git diff
```

For Studio source changes:

```bash
cd apps/studio
npm run typecheck
npm run build
```

For docs or shell hook changes:

```bash
git diff --check
bash -n scripts/ops/agent-session-start.sh
bash -n scripts/ops/agent-session-stop-review.sh
```

## Stop-Session Review

```bash
./scripts/ops/agent-session-stop-review.sh
```

Manual checklist:

- Did the task reveal a new convention?
- Did `AGENTS.md` become stale?
- Did any `.agents/skills` file become stale?
- Were test commands missing?
- Did the agent touch files outside scope?
- Did the chat-first contract remain intact?
- Should a GitHub issue be updated?
