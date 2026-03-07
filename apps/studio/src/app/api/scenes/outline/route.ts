import { NextRequest } from "next/server";
import { postScenesOutlineResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postScenesOutlineResponse(req, "default");
}
