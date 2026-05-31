---
name: memory-integrity-review
description: Use when reviewing a generated chapter for canon/world/character/timeline drift, or auditing that the memory extraction/filter layer is clean and complete before trusting it for writing. Grounds every judgment in the live story memory DB, not in model assumptions. Triggers: "review this chapter", "is chapter N publishable", "is the memory clean", "why did the writing drift", "audit the extraction layer", "check continuity against canon".
---

# Memory-Integrity Review

## Why this skill exists (the core lesson)

Generated prose can read well sentence-by-sentence yet be unpublishable because
it contradicts the story's established world, characters, or timeline. An
automatic "quality score" cannot catch this — only a reviewer that reads the
**actual canon memory from the database** can.

Verified failure pattern (the_subcurrent, story_id 2, Chapter 11, 2026-05-31):
the extraction layer had stored **only 4 character facts and ZERO world/setting
facts** (`story_worldbuilding_note=0`, no setting/tech facts in `canon_fact`).
The writer therefore had no grounding for the world's texture (a contemporary
setting: phones, notebooks, dormitory, electric bike) and **invented a generic
cyberpunk world** (synth-steel, nutrient paste, a "utility skimmer" instead of
the canonical electric bike). The prose was good; the chapter was not publishable.

**Root chain: dirty/incomplete extraction → missing world grounding → the model
hallucinates the gap → drift.** Clean the memory layer first, then review the
prose against it.

## Required context (read first, every session)

1. `AGENTS.md`
2. `.agents/workflows/prompt-universe.md`
3. This skill. Then load, only if needed:
   - `story-context-grooming` — extraction, memory, source trace, context readiness.
   - `narrative-style-continuity-research` — style vs story-truth, prose rubric
     (`references/prose-evaluation-rubric.md`), local A/B report intake.
4. `apps/studio/README.md` if a fix would touch Studio workflows.

Source of truth is the **live DB and source chapters**, never model memory or
stale local notes. Verify every claim against current data before asserting it.

## Environment quick facts

- Postgres: `postgresql://novel:novelpass@localhost:5433/novel` (container `novel_pg`).
  Query via `docker exec novel_pg psql -U novel -d novel -c "<SQL>"`.
- Resolve the story first: `SELECT id, slug FROM story_series WHERE slug ILIKE '%<name>%';`
  Beware many near-duplicate stories (e.g. `the_subcurrent` id 2 = canonical/analyzed;
  `the-subcurrent` id 142 = empty placeholder; `subcurrent_real_*` = throwaway E2E
  stories). Pick the one with scenes + snapshots + rollups.
- Generated drafts: `chapter_draft` (full_text, status). Source prose:
  `narrative_scene` (chapter_id, idx, draft_text).
- A/B / review artifacts live under `.runtime/ab-compare-*/`.

## Step 1 — Memory-cleanliness audit (run BEFORE trusting memory for writing)

Resolve `story_id`, then check each lane. "Clean" means present, consistent,
and grounded.

```sql
-- A. Fact coverage by kind. RED FLAG: only character/cast tags, no setting/world/object.
SELECT unnest(tags) AS tag, count(*) FROM canon_fact WHERE story_id=$ID GROUP BY tag ORDER BY 2 DESC;
-- B. World grounding. RED FLAG: 0 (writer will hallucinate the world's texture).
SELECT count(*) FROM story_worldbuilding_note WHERE story_id=$ID;
-- C. High-level memory lanes. RED FLAG: no APPROVED arc/story rows -> LEGACY fallback.
SELECT scope_type, approval_status, count(*) FROM writing_scope_snapshot_v1 WHERE story_id=$ID GROUP BY 1,2;
-- D. Per-chapter analysis coverage. RED FLAG: fewer snapshots than chapters.
SELECT count(*) FROM writing_snapshot_v3 WHERE story_id=$ID;
SELECT count(DISTINCT chapter_id) FROM narrative_scene WHERE story_id=$ID;
```

Cleanliness checklist (each must hold, or flag it):
- Every active character has a current-state fact AND a motivation (not "N/A").
- Character attributes are consistent across chapters (gender/pronoun,
  relationships). Verify pronouns from the source, not assumption — e.g. Cerin is
  male in canon ("Lyna, his girlfriend"); a chapter using "she" for Cerin is wrong.
- World/setting facts exist and fix the tech/era texture (the #1 missing lane).
- Timeline facts are event+location+chapter ordered, no contradictions.
- arc and story rollups exist and are APPROVED (else memory_runtime falls back to
  legacy → `LEGACY_CONTEXT_FALLBACK_APPLIED` → degraded writing context).
- No duplicate/contradictory facts for the same entity.

Known gaps to expect (open issues): buildWorkingSet hardcodes world_rules/
world_flags/motivation empty (#192); memory_runtime_v5 not loading APPROVED
arc/saga lanes (#194); extraction captures characters but not world-texture.

## Step 2 — Grounded chapter review

For a generated chapter (from `chapter_draft` or an A/B `case*-prose.md`):

1. Pull the **prior chapter's ending** (`narrative_scene` last idx of chapter N-1)
   and the **canon facts** (Step 1) as ground truth.
2. Review against canon, every finding cited to a fact or source line:
   - **World-texture consistency** — does any noun/tech contradict the established
     world? Quick drift detector: list "world nouns" in the chapter that never
     appear in chapters 1..N-1 (grep the source). New world-nouns = drift suspects.
   - **Character consistency** — pronoun/gender, relationships, known state.
   - **Timeline/continuity** — does it continue correctly from N-1; any reordering
     or re-narration of concluded events.
   - **Canon facts** — named entities, places, established rules honored.
   - **Repetition/loops** — near-duplicate sentences/paragraphs (the local-7B
     failure mode); flag if a phrase recurs many times.
   - **Advancement** — does the chapter move the plot, or circle.
   - **Prose quality** — cadence, diction, over-writing, prompt artifacts leaking
     (e.g. capitalized BUT/IF/THEN connectors).
3. Separate **"caused by dirty memory"** (would be fixed by Step 1) from **"model
   error despite good memory"**. The cyberpunk drift was the former.

Do not treat a stylist-stage artifact as a finished chapter if critic, refine,
or persistence failed (check status JSON / job tasks).

## Step 3 — Publishability verdict

State plainly: publishable / not-yet / blocked. For not-yet, give the smallest
fix list, marking each as memory-layer (extraction/grooming) vs prose-layer
(rewrite pass). A chapter is publishable only when world, character, timeline,
and canon all hold AND prose has no loops/artifacts — sentence quality alone is
not enough.

## Known pipeline bottlenecks (verified 2026-05-31)

Generation can silently abort or under-deliver at several stages. When a chapter
is short, empty, or never persists, check these first:

- **Planning** (`chapterPlanning.ts`): `maxTokens` was 1800 → truncated the JSON
  plan for 2000-word targets → `JSON_PARSE_FAILED`. Raised to 6000 (commit 5df5bab).
  Studio change → requires a docker image rebuild to take effect.
- **Critic** (`worker_narrative_handlers.py`): `max_tokens` was 1000 → truncated
  critic JSON → `NARRATIVE_CRITIC_SCHEMA_INVALID` → REFINE never runs → only raw
  stylist output survives. Raised to 4000 (commit 5df5bab).
- **v3 guard `ANCHOR_MISSED`**: the prose must occur at the plan's
  `context_guard.location_anchor` (matched near-verbatim). A chapter that moves
  location fails and is blocked. Guard-blocked prose is NOT retained anywhere
  (only the guard `metadata` is in `ingest_task.result_json`) — hard to inspect.
  Workaround: prompt the chapter to stay at the planned anchor location.
- **quality_gate** (`quality_gate_report_v1`): permanently `pass=false`
  (FAIL_MEMORY_CONTEXT / FAIL_CANON_CONFLICT / FAIL_QUALITY_SCORE) because the
  memory lanes don't load (see Step 1 + #194). Advisory, does not block staging.
- **World grounding (#196)**: world_rules exist in `writing_snapshot_v3.snapshot_json`
  but never reach `story_worldbuilding_note` (the table the writer's CORE world
  context reads) → world drift. Backfill projects snapshot world_rules into that
  table; the extracted rules are also dirty (plot/theme leakage) and need cleanup.

Open issues: #191-#196. The fix order that matters for quality: ground the world
(#196) → load memory lanes (#194) → wire read side (#192) → then the gate (#195).

## Running a grounded regeneration / A/B (runbook)

LLM provider is OpenAI-compatible (`LLM_API_BASE`/`LLM_API_KEY`/`LLM_MODEL`).
For Gemini: base = `https://generativelanguage.googleapis.com/v1beta/openai`
(NO trailing slash — trailing `/` → 404); key in `.runtime/gemini.key`, read via
a FILE in the launcher (never inline through nested shells → API_KEY_INVALID).
Free-tier daily quota: `gemini-2.5-flash`=20/day, `gemini-flash-latest`=separate
bucket, `gemini-2.0-flash`=0. A single chapter ≈ several calls, so free tier is
insufficient for unattended runs. Probe quota with `.runtime/ab-compare-ch11/quota_check.py`.

Topology: planning runs in the Studio (docker), prose in the native worker (WSL),
both on the same DB. To run Gemini end-to-end:
1. Backfill world grounding first if `story_worldbuilding_note` is empty (Step 1 / #196).
2. Native worker: `LLM_API_KEY_FILE=.../gemini.key LLM_MODEL=gemini-2.5-flash bash .runtime/ab-compare-ch11/start_worker.sh` (sets `NARRATIVE_LEGACY_DISPATCH_ENABLED=1`).
3. Studio: a temp container `novel_studio_gemini` on :3002 from the rebuilt
   `infra-novel-studio` image with Gemini env. POST to
   `http://localhost:3002/api/stories/<slug>/chapters/<chapterId>/auto-write`.
4. Use an anchor-aligned prompt to pass the ANCHOR guard.
5. Tear down the temp container + worker when done (they hold the key / consume quota).

## Output contract

- `Story resolved`: id, slug, why this one.
- `Memory audit`: per-lane status with the RED FLAGS found (cite counts).
- `Review findings`: per dimension, each cited to a canon fact or source line,
  tagged memory-caused vs model-caused.
- `Verdict`: publishable / not-yet / blocked + smallest fix list.
- `Pattern note`: any recurring extraction/filter defect worth an issue or a
  grooming pass (this is the "frequent review → find patterns" goal).

## Guardrails

- Never assert a canon fact from memory/assumption — read it from the DB or source.
- Never promote generated prose into canon/memory without explicit approval.
- A permanently-failing automatic gate is worse than none; prefer this grounded
  review (route only the uncertain cases to the human) over a blind quality score.
- Flag, do not silently fix: surface dirty-memory patterns; cleaning extraction
  is a grooming decision the user owns.
