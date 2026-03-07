import { NextRequest } from "next/server";
import { postMuseStreamResponse } from "@/features/muse/server/museStreamService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return postMuseStreamResponse(req);
}
