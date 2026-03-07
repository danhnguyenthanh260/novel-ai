import { NextRequest } from "next/server";
import { validateIngestResponse } from "@/features/ingest/server/ingestAuxService";
import { getValidateReportResponse } from "@/features/ingest/server/ingestValidateService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return validateIngestResponse(req, storySlug);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getValidateReportResponse(req, storySlug);
}
