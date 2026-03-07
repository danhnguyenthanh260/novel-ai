import { NextRequest } from "next/server";
import { getAgentProfileSlotsResponse, postAgentProfileSlotResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; profileId: string }> }
) {
  const { slug, profileId } = await ctx.params;
  return getAgentProfileSlotsResponse(req, slug, profileId);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; profileId: string }> }
) {
  const { slug, profileId } = await ctx.params;
  return postAgentProfileSlotResponse(req, slug, profileId);
}
