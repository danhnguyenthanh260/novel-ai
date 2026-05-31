---
name: session-retrospective
description: Use when the user asks to consolidate/distill the current session into durable artifacts — "đúc kết session", "read back this session and capture lessons", "update skills/memory/harness from what we learned", "retrospective", "tổng hợp kinh nghiệm". Turns a long working session into updated skills, memory, a harness report, and issues. NOT for checking harness consistency/drift (use agent-harness-consistency-pass) and NOT for routing a new task.
---

# Session Retrospective

## Purpose

Capture what a long session actually taught — the durable, cross-session, verified
lessons — into the right places so the next session (even with no context) can
continue. Distill, do not transcribe: most session steps are noise; keep only what
changes future behavior.

## Required context

1. Read `AGENTS.md` and `.agents/workflows/prompt-universe.md`.
2. Skim this session's own thread for: what was done, what was learned, what failed
   and why, decisions made, and corrections the user gave.
3. Source of truth is the live repo / DB / GitHub, NOT session recollection.
   Re-verify any claim before recording it as durable fact.

## Signal vs noise (the hard part)

Keep a lesson only if it is **durable + cross-session + verified**:
- A non-obvious root cause, a fix and why, an operational gotcha, a decision and
  its rationale, a corrected misunderstanding, a repeated failure pattern.
Drop: one-off steps, transient errors already resolved, exploratory dead-ends,
anything the repo/git history already records, anything specific to this chat only.

If you cannot verify a lesson against live state, mark it as unverified or omit it.

## The four buckets (update each as warranted)

1. **Skills** (`.agents/skills/<skill>/SKILL.md`)
   - Prefer EDITING an existing skill to fold in a refined lesson. Only CREATE a
     new skill for a genuinely new, repeatable pattern (and keep it minimal).
   - New skill ⇒ add allowlist lines to `.gitignore`
     (`!.agents/skills/<name>/` and `!.agents/skills/<name>/SKILL.md`) AND a routing
     row in `.agents/workflows/prompt-universe.md` (canonical; do NOT edit the thin
     root `prompt-universe.md`).

2. **Memory** (the assistant's auto-memory, separate from the repo)
   - `project`: current state, goals, decisions not derivable from code/git.
   - `feedback`: corrections / confirmed working approaches (with the why).
   - `reference`: pointers (issues, dashboards, files).
   - CORRECT or DELETE memory that this session proved wrong. Update the index.

3. **Harness report** (`.agents/reports/<YYYY-MM-DD>-<topic>.md`)
   - One distilled report: what was done, key lessons, strategic conclusions,
     status/next. This is the durable in-repo narrative (memory is private).

4. **Issues** (GitHub)
   - File issues for open problems found, or annotate existing ones with verified
     findings (cite file:line / DB evidence). Link related issues into a chain.

## Workflow

1. Build the lesson list from the session; filter by the signal/noise test;
   re-verify each against live state.
2. Map each lesson to a bucket. Decide edit-existing-skill vs new-skill.
3. Apply updates: skills first, then memory, then the report, then issues.
4. Commit the repo-side changes (skills + report; memory is committed separately
   by the assistant's memory system, not git). Ask before committing if the repo
   has unrelated uncommitted changes — stage only the retrospective files.
5. Report back: what was distilled, where each lesson landed, and the one-line
   trigger the user can use next session to continue.

## Output contract

- `Lessons kept` (and why) + `dropped as noise`.
- `Skills updated/created` (paths) + registration done.
- `Memory written/corrected` (names) + index updated.
- `Report` path. `Issues` filed/annotated.
- `Resume hint`: the trigger + skill that lets a fresh session pick up.

## Guardrails

- Verify before recording — never persist an unverified claim as durable fact.
- Do not duplicate what code/git/CLAUDE already capture.
- Do not create a near-duplicate skill; fold into the closest existing one unless
  the pattern is genuinely new.
- Edit the canonical router only; never duplicate it into the root pointer file.
- Stage only retrospective files when committing; leave unrelated changes alone.
