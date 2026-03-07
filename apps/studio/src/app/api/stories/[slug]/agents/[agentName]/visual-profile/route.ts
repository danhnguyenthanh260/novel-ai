import { NextRequest } from "next/server";
import { patchAgentVisualProfileResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; agentName: string }> }
) {
  const { slug, agentName } = await ctx.params;
  return patchAgentVisualProfileResponse(req, slug, agentName);
}

