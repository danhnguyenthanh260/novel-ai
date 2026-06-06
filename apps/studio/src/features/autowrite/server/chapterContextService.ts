/**
 * Chapter Context Service: Authoring Core V3
 *
 * Logic to build the "WorkingSet" - a compact, high-precision context
 * package for long-form fiction continuity.
 */

import type { PoolClient } from "pg";
import { createHash } from "crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface WorkingSet {
  story_id: number;
  chapter_id: string;
  snapshot_hash: string;
  version: string; // e.g., "3.0.0"

  // Tier 1: Anchor (Immutable/Global)
  anchor: {
    story_pitch: string;
    style_dna: {
      tone: string;
      pacing: string;
      perspective: string; // e.g., "Third Person Limited"
    };
    world_rules: Array<{ id: number; content: string }>;
  };

  // Tier 2: Active State (Causal timeline + Cast)
  active_state: {
    cast: Array<{
      name: string;
      status: string; // e.g., "Alive", "Injured", "At the tavern"
      motivation: string;
      last_seen_chapter: string;
    }>;
    world_flags: Record<string, JsonValue>; // e.g., { "is_raining": true, "castle_destroyed": false }
    timeline_facts: string[];
  };

  // Tier 3: Meso Context (Continuity loops)
  meso_context: {
    unresolved_loops: Array<{ id: string; description: string; started_at: string }>;
    milestone_summaries: string[];
  };

  // Tier 4: Ephemeral (Delta from recent chapters)
  ephemeral: {
    recent_changes: string[]; // Key deltas from last 3 chapter ledgers
  };
}

export async function buildWorkingSet(
  client: PoolClient,
  storyId: number,
  chapterId: string
): Promise<WorkingSet> {
  const chapterNo = parseInt(chapterId.replace(/\D/g, "") || "0", 10);

  // 1. Fetch Anchor (Tier 1)
  const anchorRes = await client.query(`
    SELECT description_md as pitch, s.tone_baseline, s.pacing_bias::text AS pacing_bias
    FROM public.story_series ss
    LEFT JOIN public.story_style_profile s ON s.story_id = ss.id
    WHERE ss.id = $1
  `, [storyId]);
  const anchorRow = anchorRes.rows[0];

  // 1b. Fetch World Rules (Tier 1) — CORE world-context the writer grounds on.
  // Single source of truth: story_worldbuilding_note, populated from the
  // analysis snapshot at persist time (see issue #196).
  const worldRulesRes = await client.query(`
    SELECT id, content
    FROM public.story_worldbuilding_note
    WHERE story_id = $1 AND injection_mode = 'CORE'
    ORDER BY importance DESC, updated_at DESC, id DESC
    LIMIT 30
  `, [storyId]);

  // 2. Fetch Active Cast (Tier 2) - Top 10 most recent active characters
  const castRes = await client.query(`
    SELECT f.subject as name, f.object as status, s.chapter_id
    FROM public.canon_fact f
    JOIN public.narrative_scene s ON s.id = f.scene_id
    WHERE f.story_id = $1 AND f.tags && ARRAY['cast', 'character']
    ORDER BY f.created_at DESC
    LIMIT 10
  `, [storyId]);

  // 2b. Fetch per-character motivation (most recent goal/desire fact per subject).
  const motivationRes = await client.query(`
    SELECT DISTINCT ON (lower(f.subject)) f.subject as name, f.object as motivation
    FROM public.canon_fact f
    WHERE f.story_id = $1
      AND f.tags && ARRAY['motivation', 'goal', 'desire', 'want', 'wants']
    ORDER BY lower(f.subject), f.created_at DESC
  `, [storyId]);
  const motivationByName = new Map<string, string>();
  for (const row of motivationRes.rows) {
    const key = String(row.name || "").trim().toLowerCase();
    const value = String(row.motivation || "").trim();
    if (key && value) motivationByName.set(key, value);
  }

  // 2c. Fetch timeline facts (chronology-tagged canon facts).
  const timelineRes = await client.query(`
    SELECT f.subject, f.predicate, f.object
    FROM public.canon_fact f
    WHERE f.story_id = $1
      AND f.tags && ARRAY['timeline', 'timeline_fact', 'chronology']
    ORDER BY f.created_at DESC
    LIMIT 20
  `, [storyId]);
  const timelineFacts = dedupeStrings(
    timelineRes.rows.map(r =>
      [r.subject, r.predicate, r.object].map(v => String(v ?? "").trim()).filter(Boolean).join(" ")
    )
  );

  // 3. Fetch Meso (Tier 3) - Milestones + Unresolved Loops
  const milestoneRes = await client.query(`
    SELECT summary_json
    FROM public.story_milestone
    WHERE story_id = $1 AND chapter_to < $2
    ORDER BY chapter_to DESC
    LIMIT 3
  `, [storyId, chapterNo]);

  const loopsRes = await client.query(`
    SELECT unresolved_loops
    FROM public.chapter_ledger
    WHERE story_id = $1 AND chapter_id < $2
    ORDER BY chapter_id DESC
    LIMIT 5
  `, [storyId, chapterId]);

  // 4. Fetch Ephemeral (Tier 4) - Last 2 Chapter Ledgers
  const ledgerRes = await client.query(`
    SELECT added_facts, modified_states
    FROM public.chapter_ledger
    WHERE story_id = $1 AND chapter_id < $2
    ORDER BY chapter_id DESC
    LIMIT 2
  `, [storyId, chapterId]);

  // Deduplication & Aggregation
  const unresolvedLoops = loopsRes.rows.flatMap(r => r.unresolved_loops || []);
  const milestoneSummaries = milestoneRes.rows.map(r =>
    typeof r.summary_json === 'string' ? r.summary_json : JSON.stringify(r.summary_json)
  );

  const recentChanges = ledgerRes.rows.flatMap(r => [
    ...(Array.isArray(r.added_facts) ? r.added_facts : []),
    ...(Array.isArray(r.modified_states) ? r.modified_states : [])
  ]);

  // World flags = the most recent ledger's modified_states object (jsonb object,
  // not an array). Falls back to {} when absent.
  const latestModifiedStates = ledgerRes.rows[0]?.modified_states;
  const worldFlags: Record<string, JsonValue> =
    latestModifiedStates && typeof latestModifiedStates === "object" && !Array.isArray(latestModifiedStates)
      ? (latestModifiedStates as Record<string, JsonValue>)
      : {};

  const worldRules = worldRulesRes.rows.map(r => ({
    id: Number(r.id),
    content: String(r.content ?? "").trim()
  })).filter(r => r.content.length > 0);

  // Enforce Token Budgets (Simplified)
  const finalRecentChanges = enforceBudget(dedupeStrings(recentChanges), 1000);
  const finalMilestones = enforceBudget(milestoneSummaries, 800);

  const resultSet: WorkingSet = {
    story_id: storyId,
    chapter_id: chapterId,
    snapshot_hash: generateSnapshotHash({
      anchorRow,
      worldRules,
      castRes: castRes.rows,
      worldFlags,
      timelineFacts,
      unresolvedLoops,
      recentChanges: finalRecentChanges
    }),
    version: "3.0.0",
    anchor: {
      story_pitch: anchorRow?.pitch || "N/A",
      style_dna: {
        tone: anchorRow?.tone_baseline || "Standard",
        pacing: anchorRow?.pacing_bias || "Medium",
        perspective: "Third Person Limited"
      },
      world_rules: worldRules
    },
    active_state: {
      cast: castRes.rows.map(r => ({
        name: r.name,
        status: r.status,
        motivation: motivationByName.get(String(r.name || "").trim().toLowerCase()) || "N/A",
        last_seen_chapter: r.chapter_id
      })),
      world_flags: worldFlags,
      timeline_facts: timelineFacts
    },
    meso_context: {
      unresolved_loops: unresolvedLoops,
      milestone_summaries: finalMilestones
    },
    ephemeral: {
      recent_changes: finalRecentChanges
    }
  };

  return resultSet;
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.map(s => s.trim()))).filter(Boolean);
}

function enforceBudget(lines: string[], budgetChars: number): string[] {
  const out: string[] = [];
  let current = 0;
  for (const line of lines) {
    if (current + line.length > budgetChars) break;
    out.push(line);
    current += line.length;
  }
  return out;
}

function generateSnapshotHash(data: unknown): string {
  const str = JSON.stringify(data);
  return createHash("sha256").update(str).digest("hex");
}
