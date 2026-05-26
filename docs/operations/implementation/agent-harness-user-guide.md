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
