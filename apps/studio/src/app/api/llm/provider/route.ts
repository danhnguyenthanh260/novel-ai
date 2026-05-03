import { NextRequest, NextResponse } from "next/server";
import { getActiveLlmProviderConfig, runLlmProviderHealthCheck, writeRuntimeProviderConfig } from "@/features/llm/server/llmProviderRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { redacted } = await getActiveLlmProviderConfig();
  return NextResponse.json({ provider: redacted });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = await writeRuntimeProviderConfig(body);
    return NextResponse.json({ provider });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "LLM_PROVIDER_SAVE_FAILED" }, { status: 400 });
  }
}

export async function POST() {
  const { config } = await getActiveLlmProviderConfig();
  const health = await runLlmProviderHealthCheck(config);
  return NextResponse.json({ health }, { status: health.ok ? 200 : 502 });
}
