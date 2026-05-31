import { pool } from "@/server/db/pool";

export async function resolveStoryId(slug: string): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const id = Number(res.rows[0]?.id ?? 0);
  if (!id) throw new Error("NOT_FOUND");
  return id;
}

export function parseBoolFlag(raw: string | null, fallback: boolean): boolean {
  if (!raw) return fallback;
  const val = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(val)) return true;
  if (["0", "false", "no", "off"].includes(val)) return false;
  return fallback;
}

export function computeAgentLevel(xp: number): number {
  const safeXp = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const level = Math.floor(Math.sqrt(safeXp / 1000)) + 1;
  return Math.max(1, Math.min(100, level));
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
