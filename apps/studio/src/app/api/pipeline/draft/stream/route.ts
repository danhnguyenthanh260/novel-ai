import { NextRequest } from "next/server";
import { postDraftStreamResponse } from "@/features/pipeline/server/draftStreamService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postDraftStreamResponse(req);
}
