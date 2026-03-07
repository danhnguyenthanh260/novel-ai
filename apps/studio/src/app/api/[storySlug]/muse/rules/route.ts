import { NextRequest } from "next/server";
import {
  deleteMuseRulesResponse,
  getMuseRulesResponse,
  patchMuseRulesResponse,
  postMuseRulesResponse,
} from "@/features/muse/server/museApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getMuseRulesResponse(req, storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postMuseRulesResponse(req, storySlug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return patchMuseRulesResponse(req, storySlug);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return deleteMuseRulesResponse(req, storySlug);
}
