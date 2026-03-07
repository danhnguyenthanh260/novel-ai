import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";

type HotfixAction = "BREAK_PAIR" | "RESTORE_PAIR";

function normalizeAction(value: unknown): HotfixAction | null {
  if (value === "BREAK_PAIR") return "BREAK_PAIR";
  if (value === "RESTORE_PAIR") return "RESTORE_PAIR";
  return null;
}

function textOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  return v.slice(0, max);
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = normalizeAction(body.action);
    const taxonomyVersion = textOrNull(body.taxonomy_version, 32) ?? process.env.AGENT_TAXONOMY_VERSION ?? "v1.0";
    const rulePackVersion = textOrNull(body.rule_pack_version, 32) ?? process.env.AGENT_RULE_PACK_VERSION ?? "rp1.0";
    const reason = textOrNull(body.reason, 400);
    const initiatedBy = textOrNull(body.initiated_by, 120) ?? "studio";

    if (!action) return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
    if (!reason) return NextResponse.json({ ok: false, error: "REASON_REQUIRED" }, { status: 400 });

    const enablePair = action === "RESTORE_PAIR";

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.taxonomy_rule_pack_compatibility (taxonomy_version, rule_pack_version, is_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (taxonomy_version, rule_pack_version)
       DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
      [taxonomyVersion, rulePackVersion, enablePair]
    );
    await client.query(
      `INSERT INTO public.taxonomy_hotfix_event
         (taxonomy_version, rule_pack_version, action, reason, initiated_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [taxonomyVersion, rulePackVersion, action, reason, initiatedBy]
    );
    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      action,
      taxonomy_version: taxonomyVersion,
      rule_pack_version: rulePackVersion,
      is_enabled: enablePair,
      reason_code: enablePair ? null : "ROLLBACK_TO_LAST_KNOWN_GOOD",
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "TAXONOMY_HOTFIX_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
