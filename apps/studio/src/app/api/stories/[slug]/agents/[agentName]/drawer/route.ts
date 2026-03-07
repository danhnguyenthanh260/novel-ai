import { NextRequest } from "next/server";
import { getAgentDrawerResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; agentName: string }> }
) {
  const { slug, agentName } = await ctx.params;
  return getAgentDrawerResponse(req, slug, agentName);
}

