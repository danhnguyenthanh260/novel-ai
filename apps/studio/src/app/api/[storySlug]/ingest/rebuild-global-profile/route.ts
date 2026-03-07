import { rebuildGlobalProfileResponse } from "@/features/ingest/server/ingestAuxService";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return rebuildGlobalProfileResponse(storySlug);
}
