import { NextRequest } from "next/server";
import { postScenesIntakeResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postScenesIntakeResponse(req, "default");
}
