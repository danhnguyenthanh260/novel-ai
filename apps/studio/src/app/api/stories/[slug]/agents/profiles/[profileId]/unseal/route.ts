import { NextRequest } from "next/server";
import { postAgentProfileUnsealResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; profileId: string }> }
) {
  const { slug, profileId } = await ctx.params;
  return postAgentProfileUnsealResponse(req, slug, profileId);
}
