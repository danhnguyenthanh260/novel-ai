import { NextRequest } from "next/server";
import { postValidateRuleFeedbackResponse } from "@/features/ingest/server/ingestValidateService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
    const { storySlug } = await ctx.params;
    return postValidateRuleFeedbackResponse(req, storySlug);
}
