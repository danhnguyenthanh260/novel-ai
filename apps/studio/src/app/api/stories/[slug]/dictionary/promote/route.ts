import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await props.params;
    const client = await pool.connect();
    try {
        const storyId = await resolveStoryIdForWrite(pool, resolvedParams.slug);
        const body = await req.json();
        const { rule_inferred, category, target_entity, token_key, taxonomy_version, rule_pack_version } = body;

        if (!rule_inferred) {
            return NextResponse.json({ ok: false, error: "Missing rule_inferred" }, { status: 400 });
        }

        // Determine default tier and term_key
        // E.g., if target_entity exists, we use it as key, otherwise we generate a generic key based on category or default to 'AUTO_RULE'
        let tier = "technical";
        if (category === "dialogue_rule") tier = "style";
        else if (category === "entity_protection" || target_entity) tier = "narrative";

        let termKey = target_entity ? String(target_entity).toUpperCase().replace(/\s+/g, '_') : "AUTO_RULE_";
        if (termKey === "AUTO_RULE_") {
            termKey += Math.random().toString(36).substring(2, 8).toUpperCase();
        }

        await client.query("BEGIN");

        // Promoted rules from human feedback usually have high priority (P7-P8)
        const priority = 8;
        const scope = 'local';
        const aliases = JSON.stringify([]);

        await client.query(
            `INSERT INTO public.story_dictionary 
        (story_id, tier, term_key, definition, agent_instructions, is_active, priority, scope, aliases, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, now(), now())`,
            [
                storyId,
                tier,
                termKey,
                "Auto-promoted from Supervisor Feedback",
                rule_inferred,
                priority,
                scope,
                aliases
            ]
        );

        try {
            await client.query(
                `INSERT INTO public.token_change_audit_event
                  (token_key, change_type, from_state, to_state, evidence_ref, approved_by, approved_at, taxonomy_version, rule_pack_version)
                 VALUES ($1, 'PROMOTE', $2, $3, $4, $5, now(), $6, $7)`,
                [
                    typeof token_key === "string" && token_key.trim() ? token_key.trim().toUpperCase() : "UNCLASSIFIED",
                    "observe",
                    "warn",
                    `story_dictionary:${termKey}`,
                    "studio",
                    typeof taxonomy_version === "string" && taxonomy_version.trim() ? taxonomy_version.trim() : (process.env.AGENT_TAXONOMY_VERSION ?? "v1.0"),
                    typeof rule_pack_version === "string" && rule_pack_version.trim() ? rule_pack_version.trim() : (process.env.AGENT_RULE_PACK_VERSION ?? "rp1.0"),
                ]
            );
        } catch {
            // Backward compatible: ignore audit insert if migration not yet applied.
        }

        await client.query("COMMIT");
        return NextResponse.json({ ok: true, term_key: termKey, tier, priority });
    } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("Failed to promote rule:", error);
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "DICTIONARY_PROMOTE_FAILED" }, { status: 500 });
    } finally {
        client.release();
    }
}
