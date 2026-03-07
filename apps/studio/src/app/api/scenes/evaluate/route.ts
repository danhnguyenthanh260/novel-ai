import { NextRequest } from "next/server";
import { postScenesEvaluateResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postScenesEvaluateResponse(req, "default");
}
