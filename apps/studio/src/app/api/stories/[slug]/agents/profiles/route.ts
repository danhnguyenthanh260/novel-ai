import { NextRequest } from "next/server";
import { getAgentProfilesResponse, postAgentProfileResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getAgentProfilesResponse(req, slug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return postAgentProfileResponse(req, slug);
}
