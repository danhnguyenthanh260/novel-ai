import { NextRequest } from "next/server";
import { getScenesListResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return getScenesListResponse(req, "default", {
    includeWorkunitSearch: false,
    includeStoryColumns: false,
  });
}
