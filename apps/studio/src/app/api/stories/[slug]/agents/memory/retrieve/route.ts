import { NextRequest } from "next/server";
import { postAgentMemoryRetrieveResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return postAgentMemoryRetrieveResponse(req, slug);
}
