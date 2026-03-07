import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await props.params;
    const client = await pool.connect();
    try {
        const storyId = await resolveStoryIdForWrite(pool, resolvedParams.slug);
        await client.query("BEGIN");

        const oldAutoRules = await client.query<{ term_key: string }>(
            `SELECT term_key
             FROM public.story_dictionary
             WHERE (story_id = $1 OR story_id IS NULL)
               AND term_key LIKE 'AUTO_RULE_%'
               AND is_active = true`,
            [storyId]
        );

        // 1. Deactivate all existing AUTO_RULE entries for this story
        await client.query(
            "UPDATE public.story_dictionary SET is_active = false WHERE (story_id = $1 OR story_id IS NULL) AND term_key LIKE 'AUTO_RULE_%'",
            [storyId]
        );

        if (oldAutoRules.rowCount) {
            for (const row of oldAutoRules.rows) {
                try {
                    await client.query(
                        `INSERT INTO public.token_change_audit_event
                          (token_key, change_type, from_state, to_state, evidence_ref, approved_by, approved_at, taxonomy_version, rule_pack_version)
                         VALUES ($1, 'DEMOTE', $2, $3, $4, $5, now(), $6, $7)`,
                        [
                            row.term_key || "UNCLASSIFIED",
                            "warn",
                            "observe",
                            "dictionary_consolidate:auto_rule_deactivate",
                            "studio",
                            process.env.AGENT_TAXONOMY_VERSION ?? "v1.0",
                            process.env.AGENT_RULE_PACK_VERSION ?? "rp1.0",
                        ]
                    );
                } catch {
                    // Backward compatible: ignore audit insert if migration not yet applied.
                }
            }
        }

        // 2. Define the 5 Pillars
        const pillars = [
            {
                key: "PILLAR_DIALOGUE_ANCHOR",
                tier: "narrative",
                def: "Dialogue continuity protector.",
                inst: "Never split a continuous conversation. A scene must encompass the entirety of a dialogue exchange, including internal reflections, until a natural pause or location shift occurs.",
                priority: 9
            },
            {
                key: "PILLAR_NARRATIVE_WEIGHT",
                tier: "narrative",
                def: "Enforces Concrete Blocks (2k-3k chars).",
                inst: "Prioritize 'Concrete Blocks' (2000-3000 characters). Avoid splitting for minor atmospheric shifts or reactive gestures. Each scene must contain a significant plot movement or emotional arc.",
                priority: 8
            },
            {
                key: "PILLAR_SENSORY_INTEGRITY",
                tier: "narrative",
                def: "Protects abstract/vision continuity.",
                inst: "Abstract sequences (Void, dreams, hallucinations) are single cohesive units. Preserve the character's internal continuity even if the perceived location shifts within the vision.",
                priority: 8
            },
            {
                key: "PILLAR_PHYSICAL_DOMINANCE",
                tier: "technical",
                def: "Strict hard boundary definition.",
                inst: "Hard boundaries are strictly reserved for significant physical relocation in the 'real world' or major time skips (>1 hour).",
                priority: 7
            },
            {
                key: "PILLAR_STRUCTURAL_FIDELITY",
                tier: "technical",
                def: "Whitespace and structure preservation.",
                inst: "Maintain 100% of the original paragraph structure and whitespace. Do not inject or remove line breaks for formatting purposes.",
                priority: 7
            }
        ];

        // 3. Upsert pillars as Global rules (story_id = null) or Local if preferred. 
        // User asked to replace AUTO_RULEs which are usually local. Let's make them local to the story first.
        for (const p of pillars) {
            const updated = await client.query(
                `UPDATE public.story_dictionary
                 SET tier = $1,
                     definition = $2,
                     agent_instructions = $3,
                     is_active = true,
                     priority = $4,
                     scope = 'local',
                     updated_at = now()
                 WHERE story_id = $5
                   AND term_key = $6`,
                [p.tier, p.def, p.inst, p.priority, storyId, p.key]
            );
            if ((updated.rowCount ?? 0) === 0) {
                await client.query(
                    `INSERT INTO public.story_dictionary
                       (story_id, tier, term_key, definition, agent_instructions, is_active, priority, scope)
                     VALUES
                       ($1, $2, $3, $4, $5, true, $6, 'local')`,
                    [storyId, p.tier, p.key, p.def, p.inst, p.priority]
                );
            }
        }
        await client.query("COMMIT");

        return NextResponse.json({ ok: true, message: "Dictionary consolidated to 5 Universal Pillars." });
    } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("Failed to consolidate dictionary:", error);
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "DICTIONARY_CONSOLIDATE_FAILED" }, { status: 500 });
    } finally {
        client.release();
    }
}
