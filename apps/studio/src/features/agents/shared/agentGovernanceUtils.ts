/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AgentDrawerData, DrawerEvent } from "./types";

export function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function formatDrawerEventMessage(ev: DrawerEvent): string {
  if (ev.event_type === "RUN") {
    const runId = typeof ev.meta?.run_id === "number" ? `Run #${ev.meta.run_id}` : "Run";
    const status = String(ev.status || "").toUpperCase() || "UNKNOWN";
    if (status === "DONE") {
      if (typeof ev.meta?.xp_delta === "number" && ev.meta.xp_delta > 0) {
        return `${runId}: completed (+${ev.meta.xp_delta} XP)`;
      }
      return `${runId}: completed successfully`;
    }
    if (status === "FAILED") return `${runId}: failed`;
    if (status === "TIMEOUT") return `${runId}: timed out`;
    if (status === "RUNNING") return `${runId}: is processing`;
    return `${runId}: ${status.toLowerCase()}`;
  }
  if (ev.event_type === "TUNING") {
    const action = String(ev.status || "").toUpperCase();
    if (action === "PROMOTE_ACTIVE") return "Prompt promoted to ACTIVE";
    if (action === "PROMOTE_CANARY") return "Prompt promoted to CANARY";
    if (action === "ROLLBACK_PROMPT") return "Prompt rollback executed";
  }
  if (ev.event_type === "GROWTH") {
    const action = String(ev.status || "").toUpperCase();
    if (action === "XP_RECALC") {
      const xp = Number(ev.meta?.experience_pts ?? 0);
      const level = Number(ev.meta?.level ?? 0);
      if (xp > 0 && level > 0) return `XP recalculated: ${xp} XP (Level ${level})`;
      return "XP recalculated";
    }
    if (action === "SEAL") return "Profile sealed";
    if (action === "UNSEAL") return "Profile unsealed";
  }
  return ev.message;
}

export function avatarStateTone(state: "IDLE" | "RUNNING" | "DEGRADED" | "BLOCKED"): string {
  if (state === "RUNNING") return "agent-avatar--running";
  if (state === "DEGRADED") return "agent-avatar--degraded";
  if (state === "BLOCKED") return "agent-avatar--blocked";
  return "agent-avatar--idle";
}

export function avatarFxClass(fxLevel: string): string {
  const val = (fxLevel || "").trim().toLowerCase();
  if (val === "off" || val === "none") return "agent-avatar--fx-none";
  if (val === "high") return "agent-avatar--fx-high";
  return "agent-avatar--fx-low";
}

export function readChunkPromptTrace(hydrationLatest: AgentDrawerData["prompt_summary"]["hydration_latest"]): Array<Record<string, unknown>> {
  const render = hydrationLatest?.hydration_render_steps_json;
  if (!render || typeof render !== "object" || Array.isArray(render)) return [];
  const chunks = (render as Record<string, unknown>).chunk_prompt_trace;
  if (!Array.isArray(chunks)) return [];
  return chunks.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x));
}

export async function readJson(res: Response): Promise<any> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP_${res.status}`);
  return j;
}
