import { NextRequest } from "next/server";
import { getStoriesResponse, postStoriesResponse } from "@/features/story/server/storyApiService";

export const runtime = "nodejs";

export async function GET() {
  return getStoriesResponse();
}

export async function POST(req: NextRequest) {
  return postStoriesResponse(req);
}
