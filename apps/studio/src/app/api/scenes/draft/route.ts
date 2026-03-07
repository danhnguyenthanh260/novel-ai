import { NextRequest } from "next/server";
import { postScenesDraftResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postScenesDraftResponse(req, "default");
}
