import { NextRequest } from "next/server";
import { getIngestWorkerResponse, postIngestWorkerResponse } from "@/features/ingest/server/ingestWorkerService";

export const runtime = "nodejs";

export async function GET() {
  return getIngestWorkerResponse();
}

export async function POST(req: NextRequest) {
  return postIngestWorkerResponse(req);
}
