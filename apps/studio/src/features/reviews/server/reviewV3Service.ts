import { pool } from "@/server/db/pool";
import type { PoolClient } from "pg";

export interface ContinuityIssue {
    id: number;
    issue_type: string;
    severity: string;
    description: string;
    payload: any;
    auto_patch_available: boolean;
    patch_suggestion?: string;
}

/**
 * Service to handle Authoring Core V3 specific review actions.
 */
export class ReviewV3Service {
    /**
     * Applies a patch suggestion to a chapter draft.
     */
    static async applyChapterPatch(client: PoolClient, storyId: number, chapterId: string, issueId: number) {
        const issueRes = await client.query<ContinuityIssue>(
            `SELECT id, patch_suggestion, auto_patch_available
             FROM public.chapter_continuity_issue
             WHERE id = $1 AND story_id = $2 AND chapter_id = $3`,
            [issueId, storyId, chapterId]
        );
        const issue = issueRes.rows[0];

        if (!issue || !issue.auto_patch_available || !issue.patch_suggestion) {
            throw new Error("PATCH_NOT_AVAILABLE");
        }

        // 1. Get current draft
        const draftRes = await client.query<{ full_text: string }>(
            `SELECT full_text FROM public.chapter_draft
             WHERE story_id = $1 AND chapter_id = $2
             ORDER BY version_no DESC LIMIT 1`,
            [storyId, chapterId]
        );
        if (draftRes.rowCount === 0) throw new Error("CHAPTER_DRAFT_NOT_FOUND");
        let fullText = draftRes.rows[0].full_text;

        // 2. Simple Patch Application (In a real scenario, this might involve LLM or diff-match-patch)
        // For Phase 8 MVP, we append or replace based on marker if available,
        // but here we just append a "CO-AUTHOR NOTE" if we can't find a clean insertion point.
        // The prompt during Phase 5 extraction should provide a patch that looks like a replacement block.

        fullText += `\n\n[REVISION NOTE: ${issue.patch_suggestion}]\n`;

        // 3. Update Draft (New Version)
        await client.query(
            `INSERT INTO public.chapter_draft (story_id, chapter_id, full_text, version_no, status)
             SELECT story_id, chapter_id, $3, COALESCE(MAX(version_no), 0) + 1, 'DRAFT'
             FROM public.chapter_draft
             WHERE story_id = $1 AND chapter_id = $2
             GROUP BY story_id, chapter_id`,
            [storyId, chapterId, fullText]
        );

        // 4. Mark issue as RESOLVED
        await client.query(
            `UPDATE public.chapter_continuity_issue SET status = 'RESOLVED_PATCHED' WHERE id = $1`,
            [issueId]
        );

        return { ok: true };
    }

    /**
     * Resolves ledger facts into canon_fact table after review.
     */
    static async resolveLedgerToCanon(client: PoolClient, storyId: number, chapterId: string) {
        const ledgerRes = await client.query<{ added_facts: any[] }>(
            `SELECT added_facts FROM public.chapter_ledger
             WHERE story_id = $1 AND chapter_id = $2`,
            [storyId, chapterId]
        );

        if (ledgerRes.rowCount === 0) return { ok: true, count: 0 };

        const addedFacts = ledgerRes.rows[0].added_facts || [];
        let count = 0;

        for (const fact of addedFacts) {
            // Check if exists to avoid duplicates
            const factText = typeof fact === "string" ? fact : String(fact.fact || fact.content || "").trim();
            if (!factText) continue;

            const exists = await client.query(
                `SELECT 1 FROM public.story_canon_fact
                 WHERE story_id = $1 AND content = $2`,
                [storyId, factText]
            );

            if (exists.rowCount === 0) {
                await client.query(
                    `INSERT INTO public.story_canon_fact (story_id, category, content, importance, source_ref)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [storyId, typeof fact === "object" && fact ? fact.category || 'lore' : 'lore', factText, 3, `chapter_ledger:${chapterId}`]
                );
                count++;
            }
        }

        return { ok: true, count };
    }
}
