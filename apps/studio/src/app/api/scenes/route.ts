import { NextRequest } from "next/server";
import { withDefaultScenesAliasDeprecation } from "@/features/scenes/server/scenesApi/defaultAliasDeprecation";
import { getScenesListResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const response = await getScenesListResponse(req, "default", {
    includeWorkunitSearch: false,
    includeStoryColumns: false,
  });
  return withDefaultScenesAliasDeprecation(response);
}
