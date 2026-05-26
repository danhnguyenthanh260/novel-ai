# Agent Harness Maintenance

Issue: #172
Status: Active maintenance guide
Last updated: 2026-05-26

## Purpose

Keep the Agent Harness useful as the repo changes. Harness rules should become more accurate over time, but they must not become noisy or self-mutating.

## Maintenance Triggers

Review the harness when:

- an agent used stale paths or commands
- an agent missed a required skill
- an agent touched files outside scope
- a test command or service requirement changed
- a new repeated workflow emerged
- a chat-first regression was found
- a GitHub issue or PR revealed a missing guardrail

## Skill Change Proposal

Use this format before editing a skill:

```md
# Skill Change Proposal

## Failure Observed

## Current Skill Gap

## Proposed Skill Edit

## Validation Task

## Risk

## Decision
- [ ] Accepted
- [ ] Rejected
- [ ] Needs revision
```

## Rubric

| Dimension | Pass condition |
|---|---|
| Investigation quality | Agent verified repo root, read required sources, and mapped the relevant files before edits. |
| Scope discipline | Agent changed only files declared in the plan or explained deviations before editing. |
| Chat-first contract | Agent preserved Write workspace command routing, timeline readability, inspector role, and long-text handling. |
| Verification quality | Agent ran or clearly explained the relevant checks. |
| Environment transparency | Agent named required services and did not claim hidden E2E success. |
| Final report quality | Agent reported files changed, tests, skipped checks, risks, and harness updates. |

## Rules

- Do not auto-edit skills after every run.
- Do not make skills long catch-all manuals.
- Prefer small, evidence-backed edits.
- Link accepted skill changes to the issue or PR that motivated them.
- Keep runtime skills under `.agents/skills/`.
