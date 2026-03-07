import { NextRequest } from "next/server";
import { getAgentContextSnapshotResponse } from "@/features/agents/server/agentsApiService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; snapshotId: string }> }
) {
  const { slug, snapshotId } = await ctx.params;
  return getAgentContextSnapshotResponse(req, slug, snapshotId);
}
