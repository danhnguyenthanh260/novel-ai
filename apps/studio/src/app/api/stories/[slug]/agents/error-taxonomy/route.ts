import { NextRequest } from "next/server";
import { getAgentErrorTaxonomyResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getAgentErrorTaxonomyResponse(req, slug);
}
