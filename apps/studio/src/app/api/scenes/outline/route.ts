import { NextRequest } from "next/server";
import { withDefaultScenesAliasDeprecation } from "@/features/scenes/server/scenesApi/defaultAliasDeprecation";
import { postScenesOutlineResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const response = await postScenesOutlineResponse(req, "default");
  return withDefaultScenesAliasDeprecation(response);
}
