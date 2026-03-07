import { NextRequest } from "next/server";
import { postAgentPromptPromoteActiveResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; versionId: string }> }
) {
  const { slug, versionId } = await ctx.params;
  return postAgentPromptPromoteActiveResponse(req, slug, versionId);
}
