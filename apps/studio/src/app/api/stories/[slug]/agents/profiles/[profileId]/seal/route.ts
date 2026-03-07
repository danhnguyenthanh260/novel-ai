import { NextRequest } from "next/server";
import { postAgentProfileSealResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; profileId: string }> }
) {
  const { slug, profileId } = await ctx.params;
  return postAgentProfileSealResponse(req, slug, profileId);
}
