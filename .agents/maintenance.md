# Agent Harness Maintenance

Issue: #172
Status: Active maintenance guide
Last updated: 2026-05-28

## Purpose

Keep the Agent Harness useful as the repo changes. Harness rules should become
more accurate over time, but they must not become noisy or self-mutating.

`.agents/` is the single operating layer for harness material. Maintenance
updates should patch `.agents/README.md`, `.agents/workflows/`,
`.agents/skills/`, `.agents/reports/`, or `.agents/scripts/` as appropriate.
Product architecture and system contracts still belong in `docs/`.

This is an agent-assisted improvement loop: an agent may study sessions and
propose skill changes, but a human must approve the proposal before any skill
file is edited.

## Maintenance Triggers

Review the harness when:

- an agent used stale paths or commands
- an agent missed a required skill
- a vague prompt was routed to the wrong workflow
- an agent failed to stop for a required user decision
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
| Routing quality | Agent used `prompt-universe.md` for vague prompts and selected the smallest relevant skill set. |
| Decision discipline | Agent stopped for user approval when a product, architecture, data, workflow, or issue-planning decision was required. |
| Scope discipline | Agent changed only files declared in the plan or explained deviations before editing. |
| Chat-first contract | Agent preserved Write workspace command routing, timeline readability, inspector role, and long-text handling. |
| Verification quality | Agent ran or clearly explained the relevant checks. |
| Environment transparency | Agent named required services and did not claim hidden E2E success. |
| Final report quality | Agent reported files changed, tests, skipped checks, risks, and harness updates. |

## Rules

- Do not auto-edit skills after every run.
- Do not let an agent apply its own proposal without human approval.
- Use proposal-only mode when asking an agent to review sessions.
- After approval, keep the patch limited to the approved `.agents/` files.
- Do not make skills long catch-all manuals.
- Prefer small, evidence-backed edits.
- Link accepted skill changes to the issue or PR that motivated them.
- Keep runtime skills under `.agents/skills/`.
- Keep prompt routing under `.agents/workflows/prompt-universe.md`.
- Keep harness reports and inventories under `.agents/reports/`.
- Do not create a second active harness layer under `docs/agent-skills/`,
  `docs/operations/`, `.ai/`, or `.ai-harness/`.

## Session Review Workflow

1. Collect evidence:
   - session summary
   - PR comments
   - failed command output
   - final report
   - files touched
   - checks run or skipped
2. Ask the agent for proposal-only review.
3. Review the proposal for overfitting, scope creep, stale assumptions, and
   duplication.
4. Approve, reject, or request revision.
5. If approved, ask the agent to patch only the approved `.agents/` files.
6. Run docs checks and open a PR to `staging`.

## Proposal-Only Prompt

```md
Use the Novel AI Agent Operating Layer.

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

Update only the approved `.agents/` files.
Do not change product code.
Run docs checks.
Open a PR to staging.
```
