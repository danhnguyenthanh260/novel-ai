import { NextRequest } from "next/server";
import { getAgentProfileEventsResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; profileId: string }> }
) {
  const { slug, profileId } = await ctx.params;
  return getAgentProfileEventsResponse(req, slug, profileId);
}
