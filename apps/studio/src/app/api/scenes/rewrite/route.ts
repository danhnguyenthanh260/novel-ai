import { NextRequest } from "next/server";
import { postScenesRewriteResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postScenesRewriteResponse(req, "default");
}
