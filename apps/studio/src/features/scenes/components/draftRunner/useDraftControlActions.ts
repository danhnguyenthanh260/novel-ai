import { useCallback } from "react";
import { apiBase } from "@/lib/apiBase";
import type { ConsistencySummary, GuardPayload } from "@/features/scenes/components/draftRunner/shared";

type RunningAction = "none" | "commit" | "consistency" | "evaluate" | "rewrite" | "lock" | "autowrite";

export function useDraftControlActions(params: {
  canRunControlAction: boolean;
  canAutoWrite: boolean;
  commitReady: boolean;
  storySlug: string;
  sceneId: string;
  workunitId?: string;
  seedPrompt: string;
  text: string;
  writingLanguage: string;
  bufferKey: string;
  maxContextTokens: number;
  onCommitted?: () => Promise<void> | void;
  flushLocalBuffer: () => void;
  setMsg: (value: string | null) => void;
  setGuard: (value: GuardPayload | null) => void;
  setConsistencySummary: (value: ConsistencySummary | null) => void;
  setLastGuardTokens: (value: number) => void;
  setLastCheckedAt: (value: string | null) => void;
  setText: (value: string) => void;
  setBaselineText: (value: string) => void;
  setBufferState: (value: "idle" | "pending" | "saved") => void;
  setRunningAction: (value: RunningAction) => void;
}) {
  const checkConsistency = useCallback(async () => {
    if (!params.canRunControlAction) return;
    params.setRunningAction("consistency");
    params.setMsg(null);
    try {
      const keywords = `${params.seedPrompt}\n${params.text.slice(Math.max(0, params.text.length - 500))}`;
      const res = await fetch(`${apiBase(params.storySlug)}/guard/preflight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_id: Number(params.sceneId),
          workunit_id: params.workunitId,
          keywords,
          max_context_tokens: params.maxContextTokens,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `CONSISTENCY_FAILED_${res.status}`);
      params.setGuard(json.guard as GuardPayload);
      const uncertain = (json.guard?.sections?.local?.uncertain ?? json.guard?.sections?.uncertain ?? []) as string[];
      const canon = (json.guard?.sections?.local?.canon ?? json.guard?.sections?.canon ?? []) as string[];
      const relationships = (json.guard?.sections?.local?.relationships ?? json.guard?.sections?.relationships ?? []) as string[];
      const recentEvents = (json.guard?.sections?.local?.recentEvents ?? json.guard?.sections?.recentEvents ?? []) as string[];
      const canonConflicts: string[] = [];
      if (canon.length === 0 && relationships.length === 0) canonConflicts.push("No canon/relationship context retrieved. Contradiction risk is high.");
      for (const line of uncertain) if (/canon coverage low|contradict|inconsistent/i.test(line)) canonConflicts.push(line);
      const timelineInconsistencies: string[] = [];
      if (recentEvents.length === 0) timelineInconsistencies.push("No recent timeline events retrieved for this scene.");
      for (const line of uncertain) if (/timeline context missing|event order|chronology/i.test(line)) timelineInconsistencies.push(line);
      params.setConsistencySummary({
        canonConflicts,
        timelineInconsistencies,
        uncertainQuestions: uncertain.length > 0 ? uncertain : ["No explicit TODO question flagged."],
      });
      params.setLastGuardTokens(Number(json.guard?.stats?.approx_tokens ?? 0));
      params.setLastCheckedAt(new Date().toISOString());
      params.setMsg(uncertain.length > 0 ? `Consistency check: ${uncertain.length} uncertainty flag(s).` : "Consistency check completed.");
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "CONSISTENCY_FAILED");
    } finally {
      params.setRunningAction("none");
    }
  }, [params]);

  const evaluateScene = useCallback(async () => {
    if (!params.canRunControlAction) return;
    params.setRunningAction("evaluate");
    params.setMsg(null);
    try {
      const res = await fetch(`${apiBase(params.storySlug)}/scenes/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: Number(params.sceneId), mode: "llm" }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `EVALUATE_FAILED_${res.status}`);
      params.setMsg("Evaluate done. Scene moved to EVALUATED.");
      await params.onCommitted?.();
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "EVALUATE_FAILED");
    } finally {
      params.setRunningAction("none");
    }
  }, [params]);

  const rewriteTargeted = useCallback(async () => {
    if (!params.canRunControlAction) return;
    params.setRunningAction("rewrite");
    params.setMsg(null);
    try {
      const res = await fetch(`${apiBase(params.storySlug)}/scenes/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: Number(params.sceneId), mode: "llm", summary: "targeted rewrite from write tab" }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `REWRITE_FAILED_${res.status}`);
      if (json?.guard?.approx_tokens) params.setLastGuardTokens(Number(json.guard.approx_tokens));
      params.setMsg(`Rewrite done. New version v${json?.version_no ?? "?"}.`);
      await params.onCommitted?.();
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "REWRITE_FAILED");
    } finally {
      params.setRunningAction("none");
    }
  }, [params]);

  const lockScene = useCallback(async () => {
    if (!params.canRunControlAction) return;
    params.setRunningAction("lock");
    params.setMsg(null);
    try {
      const res = await fetch(`${apiBase(params.storySlug)}/scenes/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: Number(params.sceneId) }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `LOCK_FAILED_${res.status}`);
      params.setMsg("Scene locked.");
      await params.onCommitted?.();
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "LOCK_FAILED");
    } finally {
      params.setRunningAction("none");
    }
  }, [params]);

  const runAutoWrite = useCallback(async () => {
    if (!params.canAutoWrite) return;
    params.setRunningAction("autowrite");
    params.setMsg(null);
    try {
      const res = await fetch(`${apiBase(params.storySlug)}/autowrite/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_id: Number(params.sceneId),
          scene_spec: params.seedPrompt,
          writing_language: params.writingLanguage,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `AUTOWRITE_FAILED_${res.status}`);
      if (typeof json?.final_text === "string" && json.final_text.trim()) {
        params.setText(json.final_text);
        params.setBaselineText(json.final_text);
      }
      localStorage.removeItem(params.bufferKey);
      params.setBufferState("idle");
      params.setMsg(
        `AutoWrite done in ${json?.rounds_used ?? "?"} round(s), verdict=${json?.final_verdict ?? "unknown"}, saved v${
          json?.version_no ?? "?"
        }.`
      );
      await params.onCommitted?.();
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "AUTOWRITE_FAILED");
    } finally {
      params.setRunningAction("none");
    }
  }, [params]);

  const commitVersion = useCallback(async () => {
    if (!params.commitReady) return;
    params.flushLocalBuffer();
    params.setRunningAction("commit");
    params.setMsg(null);
    try {
      const res = await fetch(`${apiBase(params.storySlug)}/scenes/${params.sceneId}/commit-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_content: params.text }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `COMMIT_FAILED_${res.status}`);
      params.setBaselineText(params.text);
      localStorage.removeItem(params.bufferKey);
      params.setBufferState("idle");
      params.setMsg(`Committed v${json.version_no}.`);
      await params.onCommitted?.();
    } catch (e: unknown) {
      params.setMsg(e instanceof Error ? e.message : "COMMIT_FAILED");
    } finally {
      params.setRunningAction("none");
    }
  }, [params]);

  return {
    checkConsistency,
    evaluateScene,
    rewriteTargeted,
    lockScene,
    runAutoWrite,
    commitVersion,
  };
}
