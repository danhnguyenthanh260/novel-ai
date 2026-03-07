import { NextRequest } from "next/server";
import { postAgentFeedbackMuteResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; feedbackId: string }> }
) {
  const { slug, feedbackId } = await ctx.params;
  return postAgentFeedbackMuteResponse(req, slug, feedbackId);
}
