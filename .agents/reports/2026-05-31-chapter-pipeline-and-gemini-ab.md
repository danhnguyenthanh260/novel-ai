# Session report — chapter pipeline depth + Gemini A/B (2026-05-31)

Distilled lessons from a long session that went from "Docker won't start" to
"why isn't a generated chapter production-ready". Source of truth for the claims
below is the live DB and the artifacts in `.runtime/ab-compare-ch11/`.

## What was done

- Hardened the Docker stack (commit `630def9`): Neo4j healthcheck + `service_healthy`
  deps; historian bridge baked into an image (`Dockerfile.historian`) instead of a
  fragile single-file bind mount; batched Neo4j upsert to stop a WSL-engine hang.
- Fixed the chapter pipeline so a full ~2000-word chapter completes (commit `5df5bab`):
  planning `maxTokens` 1800→6000, critic `max_tokens` 1000→4000, `call_llm_text`
  now logs HTTP error bodies.
- Added skill `memory-integrity-review` (commit `c3def8e`) — grounded chapter
  review + memory-extraction cleanliness audit, self-contained for fresh sessions.
- Opened issues #191-#196 covering the full chain from memory extraction to gate.
- Backfilled `story_worldbuilding_note` for story 2 (61 CORE notes from snapshot
  world_rules) to test the #196 fix.

## Key lessons (the durable ones)

1. **Good prose ≠ publishable chapter.** Gemini wrote vivid, well-paced prose that
   still failed: it invented a cyberpunk world (skimmer/synth/nutrient) against a
   canonical contemporary setting. Only a reviewer reading the actual canon memory
   catches this; an automatic quality score never would. → memory-grounded review
   is the right gate design.

2. **Dirty/incomplete memory → wrong writing.** Verified: story 2 had character
   facts but ZERO world facts reaching the writer. world_rules are extracted and
   stored in `writing_snapshot_v3.snapshot_json`, but the writer's CORE world
   context reads `story_worldbuilding_note`, which the pipeline never writes (#196).
   And the extracted world_rules are themselves dirty (plot/theme leakage, dupes).

3. **The pipeline fails silently at token limits.** Planning and critic both had
   max_tokens that truncated their JSON for longer chapters, aborting mid-pipeline
   and leaving only raw first-pass output. Always check stage max_tokens when a
   chapter is short/empty/unpersisted.

4. **A guard can block AND discard.** The v3 `ANCHOR_MISSED` guard blocks a chapter
   that moves away from the planned location anchor, and the blocked prose is not
   retained — making failures hard to debug.

5. **Free LLM tiers don't sustain an auto-pipeline.** `gemini-2.5-flash` free =
   20 requests/day; one chapter spends several. Unattended generation needs a paid
   tier or model rotation.

6. **Operational gotchas, hard-won:** Gemini base URL must have no trailing slash
   (else 404); secrets must be read from a file inside the launcher, not passed
   through nested git-bash→wsl→bash (mangles → API_KEY_INVALID); the real novel-ai
   studio is on :3001 (docker), not :3000 (a different app); `pkill -f X` self-matches
   when its own command line contains X (use a bracket pattern).

## What an auto-pipeline actually needs (strategic)

Not "make the current gate green". Two tiers:
- **Objective, blocking:** memory loaded, no canon contradiction, world-texture
  consistent (flag new world-nouns not seen in prior chapters), no repetition,
  word/scene budget, anchor sane. These catch the catastrophic auto-mode failures.
- **Subjective, calibrated:** an LLM/Claude reviewer with DB access (this is the
  validated design), gating conservatively and routing the uncertain middle to a
  human. Calibrate against a small human-labeled set before trusting it.

The honest target is "human reviews ~20%, auto handles the rest, gate trusted
because calibrated" — not a fully human-free high-quality pipeline.

## Status / next

Backfill is in place; the before/after drift test is deferred (Gemini daily quota).
Use the `memory-integrity-review` skill to drive the next review/regeneration.
Open: #191-#196. Pending host action: Windows reboot to clear `run.old` + optionally
re-enable Docker AI (disabled during the Docker fix).
