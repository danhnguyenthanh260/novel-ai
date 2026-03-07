import { NextRequest } from "next/server";
import {
  getMuseSnapshotsResponse,
  patchMuseSnapshotsResponse,
  postMuseSnapshotsResponse,
} from "@/features/muse/server/museApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getMuseSnapshotsResponse(req, storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postMuseSnapshotsResponse(req, storySlug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return patchMuseSnapshotsResponse(req, storySlug);
}
