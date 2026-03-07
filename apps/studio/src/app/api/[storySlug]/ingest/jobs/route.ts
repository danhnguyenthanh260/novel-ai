import { NextRequest } from "next/server";
import {
  createIngestJobResponse,
  getIngestJobsResponse,
  patchIngestJobResponse,
} from "@/features/ingest/server/ingestJobsService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getIngestJobsResponse(req, storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return createIngestJobResponse(req, storySlug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return patchIngestJobResponse(req, storySlug);
}
