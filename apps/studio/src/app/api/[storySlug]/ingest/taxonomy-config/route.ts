import { NextResponse } from "next/server";
import { CANONICAL_TOKEN_KEYS } from "@/features/ingest/shared/taxonomyTokens";

export const runtime = "nodejs";

export async function GET() {
  const taxonomyVersion = (process.env.AGENT_TAXONOMY_VERSION ?? "v1.0").trim();
  const rulePackVersion = (process.env.AGENT_RULE_PACK_VERSION ?? "rp1.0").trim();
  return NextResponse.json({
    ok: true,
    taxonomy_version: taxonomyVersion || "v1.0",
    rule_pack_version: rulePackVersion || "rp1.0",
    token_keys: CANONICAL_TOKEN_KEYS,
  });
}
