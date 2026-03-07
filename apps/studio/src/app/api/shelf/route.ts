import { NextRequest } from "next/server";
import { getShelfStoriesResponse } from "@/features/story/server/shelfApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return getShelfStoriesResponse(req);
}
