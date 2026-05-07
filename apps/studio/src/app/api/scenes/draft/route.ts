import { NextRequest } from "next/server";
import { withDefaultScenesAliasDeprecation } from "@/features/scenes/server/scenesApi/defaultAliasDeprecation";
import { postScenesDraftResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const response = await postScenesDraftResponse(req, "default");
  return withDefaultScenesAliasDeprecation(response);
}
