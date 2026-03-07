import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";

const RULES = [
    // Technical rules (for Ingest/Splitter)
    {
        tier: "technical",
        term_key: "MID_WORD_CUT",
        definition: "Splitting text in the middle of a word or separating punctuation.",
        agent_instructions: "STRICT: Never split narrative text in the middle of a word or between lowercase letters. Always split at natural sentence or paragraph boundaries."
    },
    {
        tier: "technical",
        term_key: "DIALOGUE_SPLIT",
        definition: "Splitting a quote away from its speaker tag.",
        agent_instructions: "STRICT: Do not place a boundary between a dialogue quote and its associated speaker tag (e.g., separating '\"Hello,\"' from 'he said')."
    },
    {
        tier: "technical",
        term_key: "PUNCTUATION_ALIGN",
        definition: "Proper alignment with terminal punctuation.",
        agent_instructions: "STRICT: Avoid creating a boundary if the left chunk does not end with terminal punctuation (period, exclamation, question mark)."
    },
    {
        tier: "technical",
        term_key: "SCENE_HEADING",
        definition: "Markdown scene headers like '## Scene'.",
        agent_instructions: "STRICT: ALWAYS treat markdown headers (e.g., '## Scene 1') as hard, non-negotiable narrative boundaries."
    },
    {
        tier: "technical",
        term_key: "LOWERCASE_START",
        definition: "Starting a new chunk with a lowercase letter.",
        agent_instructions: "STRICT: Avoid boundaries if the resulting right chunk would start with a lowercase letter."
    },

    // Style rules (for Prose/Supervisor)
    {
        tier: "style",
        term_key: "DEFAULT_VOICE",
        definition: "Baseline tone and prose formatting.",
        agent_instructions: "Maintain a consistent authorial voice. Focus on sensory details and character emotion rather than over-explaining world mechanics."
    },
    {
        tier: "style",
        term_key: "PACING_AND_REPETITION",
        definition: "Controlling wordiness and flow.",
        agent_instructions: "Only remove repetition or redundancy during edits. Do not alter the fundamental pacing or emotional impact of the original prose."
    },

    // Narrative rules (for Planner)
    {
        tier: "narrative",
        term_key: "BEAT_STRUCTURE",
        definition: "The core components of a scene beat.",
        agent_instructions: "Every scene beat must clearly articulate a Goal, a Conflict, and an Outcome. Scenes must not end abruptly."
    }
];

async function main() {
    const client = new Client({ connectionString: DB_DSN });
    await client.connect();

    console.log("Seeding global dictionary baseline rules...");

    for (const rule of RULES) {
        // Insert if not exists based on term_key (for global rules: story_id IS NULL)
        await client.query(`
      INSERT INTO public.story_dictionary (story_id, tier, term_key, definition, agent_instructions, is_active)
      VALUES (NULL, $1, $2, $3, $4, true)
      ON CONFLICT DO NOTHING
    `, [rule.tier, rule.term_key, rule.definition, rule.agent_instructions]);

        console.log(`- Seeded: [${rule.tier}] ${rule.term_key}`);
    }

    await client.end();
    console.log("Seeding complete.");
}

main().catch((err) => {
    console.error("FAIL", err);
    process.exit(1);
});
