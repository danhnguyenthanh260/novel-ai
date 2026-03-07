import { NextRequest } from "next/server";
import {
  deleteWorldbuildingResponse,
  getWorldbuildingResponse,
  patchWorldbuildingResponse,
  postWorldbuildingResponse,
} from "@/features/story/server/storyProfileService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getWorldbuildingResponse(req, storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postWorldbuildingResponse(req, storySlug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return patchWorldbuildingResponse(req, storySlug);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return deleteWorldbuildingResponse(req, storySlug);
}
