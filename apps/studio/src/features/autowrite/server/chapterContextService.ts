/**
 * Chapter Context Service: Authoring Core V3
 *
 * Logic to build the "WorkingSet" - a compact, high-precision context
 * package for long-form fiction continuity.
 */

import { pool } from "@/server/db/pool";
import type { PoolClient } from "pg";
import { createHash } from "crypto";

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
    world_flags: Record<string, any>; // e.g., { "is_raining": true, "castle_destroyed": false }
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
    SELECT description_md as pitch, s.tone_baseline, s.pacing_bias, s.perspective_mode
    FROM public.story_series ss
    LEFT JOIN public.story_style_profile s ON s.story_id = ss.id
    WHERE ss.id = $1
  `, [storyId]);
  const anchorRow = anchorRes.rows[0];

  // 2. Fetch Active Cast (Tier 2) - Top 10 most recent active characters
  const castRes = await client.query(`
    SELECT subject as name, object as status, chapter_id
    FROM public.canon_fact
    WHERE story_id = $1 AND tags && ARRAY['cast', 'character']
    ORDER BY created_at DESC
    LIMIT 10
  `, [storyId]);

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
    ...(r.added_facts || []),
    ...(r.modified_states || [])
  ]);

  // Enforce Token Budgets (Simplified)
  const finalRecentChanges = enforceBudget(dedupeStrings(recentChanges), 1000);
  const finalMilestones = enforceBudget(milestoneSummaries, 800);

  const resultSet: WorkingSet = {
    story_id: storyId,
    chapter_id: chapterId,
    snapshot_hash: generateSnapshotHash({
      anchorRow,
      castRes: castRes.rows,
      unresolvedLoops,
      recentChanges: finalRecentChanges
    }),
    version: "3.0.0",
    anchor: {
      story_pitch: anchorRow?.pitch || "N/A",
      style_dna: {
        tone: anchorRow?.tone_baseline || "Standard",
        pacing: anchorRow?.pacing_bias || "Medium",
        perspective: anchorRow?.perspective_mode || "Third Person Limited"
      },
      world_rules: []
    },
    active_state: {
      cast: castRes.rows.map(r => ({
        name: r.name,
        status: r.status,
        motivation: "N/A",
        last_seen_chapter: r.chapter_id
      })),
      world_flags: {},
      timeline_facts: []
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

function generateSnapshotHash(data: any): string {
  const str = JSON.stringify(data);
  return createHash("sha256").update(str).digest("hex");
}
