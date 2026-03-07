import { NextRequest } from "next/server";
import { postAgentExperimentPauseResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; experimentId: string }> }
) {
  const { slug, experimentId } = await ctx.params;
  return postAgentExperimentPauseResponse(req, slug, experimentId);
}
