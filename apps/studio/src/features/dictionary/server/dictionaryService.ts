"use server";

import { pool } from "@/server/db/pool";

export type DictionaryTier = "technical" | "narrative" | "style";

export type DictionaryEntry = {
    id: string;
    story_id: number | null;
    tier: DictionaryTier;
    term_key: string;
    definition: string;
    agent_instructions: string;
    is_active: boolean;
    priority: number;
    scope: 'local' | 'global';
    aliases: string[] | string;
    valid_from_chapter: number | null;
    valid_to_chapter: number | null;
    created_at: Date;
    updated_at: Date;
};

export async function getDictionaryEntries(storyId: number | null): Promise<DictionaryEntry[]> {
    if (storyId) {
        const rs = await pool.query<DictionaryEntry>(
            `SELECT * FROM public.story_dictionary 
             WHERE (story_id = $1 OR story_id IS NULL) 
               AND is_active = true 
             ORDER BY priority DESC, term_key ASC`,
            [storyId]
        );
        return rs.rows;
    } else {
        const rs = await pool.query<DictionaryEntry>(
            `SELECT * FROM public.story_dictionary 
             WHERE story_id IS NULL 
               AND is_active = true 
             ORDER BY priority DESC, term_key ASC`
        );
        return rs.rows;
    }
}

export async function upsertDictionaryEntry(
    id: string | null,
    storyId: number | null,
    tier: DictionaryTier,
    termKey: string,
    definition: string,
    agentInstructions: string,
    isActive: boolean,
    priority: number = 5,
    scope: 'local' | 'global' = 'local',
    aliases: string[] = [],
    validFrom: number | null = null,
    validTo: number | null = null
): Promise<DictionaryEntry> {
    const aliasesJson = JSON.stringify(aliases);
    if (id) {
        const rs = await pool.query<DictionaryEntry>(
            `
            UPDATE public.story_dictionary
            SET tier = $1, term_key = $2, definition = $3, agent_instructions = $4, is_active = $5, 
                priority = $6, scope = $7, aliases = $8, valid_from_chapter = $9, valid_to_chapter = $10,
                updated_at = now()
            WHERE id = $11
            RETURNING *
            `,
            [tier, termKey, definition, agentInstructions, isActive, priority, scope, aliasesJson, validFrom, validTo, id]
        );
        if (rs.rowCount === 0) throw new Error("Entry not found.");
        return rs.rows[0];
    } else {
        const rs = await pool.query<DictionaryEntry>(
            `
            INSERT INTO public.story_dictionary (story_id, tier, term_key, definition, agent_instructions, is_active, priority, scope, aliases, valid_from_chapter, valid_to_chapter)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            `,
            [storyId, tier, termKey, definition, agentInstructions, isActive, priority, scope, aliasesJson, validFrom, validTo]
        );
        return rs.rows[0];
    }
}

export async function deleteDictionaryEntry(id: string): Promise<void> {
    await pool.query(`DELETE FROM public.story_dictionary WHERE id = $1`, [id]);
}
