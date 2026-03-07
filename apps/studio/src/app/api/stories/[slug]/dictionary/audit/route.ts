import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { getDictionaryEntries } from "@/features/dictionary/server/dictionaryService";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await props.params;
    try {
        const storyId = await resolveStoryIdForWrite(pool, resolvedParams.slug);
        const entries = await getDictionaryEntries(storyId);

        if (entries.length < 2) {
            return NextResponse.json({ ok: true, conflicts: [], message: "Too few rules to audit." });
        }

        const rulesSummary = entries.map(e => `[${e.term_key}] (${e.tier}): ${e.agent_instructions}`).join("\n");

        const prompt = `
You are an AI Compliance Auditor. Your task is to scan the following Dictionary Rules for a story writing system and identify CONTRADICTORY or OVERLAPPING instructions.

RULES TO AUDIT:
${rulesSummary}

TASK:
1. Identify any rules that directly contradict each other (e.g., one says "Speak formally" and another says "Speak in slang").
2. Identify rules that are redundant or could be merged.
3. For each conflict, explain why it's a problem and suggest a resolution.

Return JSON with shape:
{
  "conflicts": [
    { "rule_a": "KEY_A", "rule_b": "KEY_B", "reason": "...", "resolution": "..." }
  ],
  "summary": "Overall health of the dictionary logic."
}
`.trim();

        const llmBase = process.env.LLM_API_BASE || "http://localhost:8080/v1";
        const llmModel = process.env.LLM_MODEL || "model.gguf";

        const res = await fetch(`${llmBase}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.LLM_API_KEY || "local"}` },
            body: JSON.stringify({
                model: llmModel,
                messages: [
                    { role: "system", content: "You are a senior logic auditor." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            }),
        });

        const data = await res.json();
        const result = JSON.parse(data.choices?.[0]?.message?.content || "{}");

        return NextResponse.json({ ok: true, ...result });
    } catch (error: any) {
        console.error("Failed to audit dictionary:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
