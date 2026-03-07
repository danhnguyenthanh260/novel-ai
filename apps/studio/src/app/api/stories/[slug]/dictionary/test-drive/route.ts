import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await props.params;
    try {
        const storyId = await resolveStoryIdForWrite(pool, resolvedParams.slug);
        const body = await req.json();
        const { sample_text, rule_content, tier } = body;

        if (!sample_text) {
            return NextResponse.json({ ok: false, error: "Missing sample_text" }, { status: 400 });
        }

        // Simulation logic: 
        // We send a request to the LLM with the rule_content and sample_text 
        // to see if it triggers or how it interprets it.

        const prompt = `
You are an AI Logic Simulator. We are testing a new Dictionary Rule for a story writing system.
RULE TIER: ${tier}
RULE INSTRUCTION: "${rule_content}"

SAMPLE TEXT:
"""
${sample_text}
"""

TASK:
1. Analyze if this rule applies to the sample text.
2. If it applies, show exactly how the text should be modified or what the Agent should keep in mind.
3. If it doesn't apply, explain why.

Return your analysis in a clear, concise format.
`.trim();

        const llmBase = process.env.LLM_API_BASE || "http://localhost:8080/v1";
        const llmModel = process.env.LLM_MODEL || "model.gguf";

        const res = await fetch(`${llmBase}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.LLM_API_KEY || "local"}` },
            body: JSON.stringify({
                model: llmModel,
                messages: [
                    { role: "system", content: "You are a senior editor and logic validator." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.2
            }),
        });

        const data = await res.json();
        const analysis = data.choices?.[0]?.message?.content || "Simulation failed.";

        return NextResponse.json({ ok: true, analysis });
    } catch (error: any) {
        console.error("Failed to test-drive rule:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
