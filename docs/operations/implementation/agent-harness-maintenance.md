# Agent Harness Maintenance

Issue: #172
Status: Active maintenance guide
Last updated: 2026-05-26

## Purpose

Keep the Agent Harness useful as the repo changes. Harness rules should become more accurate over time, but they must not become noisy or self-mutating.

This is an agent-assisted improvement loop: an agent may study sessions and propose skill changes, but a human must approve the proposal before any skill file is edited.

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
- Do not let an agent apply its own proposal without human approval.
- Use proposal-only mode when asking an agent to review sessions.
- After approval, keep the patch limited to the approved docs or `.agents/skills/*` files.
- Do not make skills long catch-all manuals.
- Prefer small, evidence-backed edits.
- Link accepted skill changes to the issue or PR that motivated them.
- Keep runtime skills under `.agents/skills/`.

## Session Review Workflow

1. Collect evidence:
   - session summary
   - PR comments
   - failed command output
   - final report
   - files touched
   - checks run or skipped
2. Ask the agent for proposal-only review.
3. Review the proposal for overfitting, scope creep, stale assumptions, and duplication.
4. Approve, reject, or request revision.
5. If approved, ask the agent to patch only the approved skill/doc files.
6. Run docs checks and open a PR to `staging`.

## Proposal-Only Prompt

```md
Use the Novel AI Agent Harness v1.

Task:
Review these session notes and propose skill improvements.

Mode:
Proposal only. Do not edit files yet.

Inputs:
[session summary, PR notes, failed commands, or logs]

Return:
- failure patterns
- evidence
- current skill gap
- proposed skill change
- risk of overfitting
- validation task
- exact files that would change if approved
```

## Approved-Change Prompt

```md
Approved skill proposal:
[paste approved proposal]

Update only the approved docs or .agents/skills files.
Do not change product code.
Run docs checks.
Open a PR to staging.
```
