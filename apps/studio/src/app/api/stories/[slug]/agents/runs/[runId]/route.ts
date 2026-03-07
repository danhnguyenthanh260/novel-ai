import { NextRequest } from "next/server";
import { getAgentRunDetailResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; runId: string }> }) {
  const { slug, runId } = await ctx.params;
  return getAgentRunDetailResponse(req, slug, runId);
}
