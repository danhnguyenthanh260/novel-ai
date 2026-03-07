import { useCallback, useEffect, useState } from "react";
import { parseJsonSafe, type MuseReportItem } from "@/features/scenes/components/draftRunner/shared";

type ReportScope = "scene" | "story";

export function useDraftReports(params: {
  storySlug: string;
  sceneId: string;
  museReportDraftKey: string;
}) {
  const { storySlug, sceneId, museReportDraftKey } = params;
  const [reportScope, setReportScope] = useState<ReportScope>("scene");
  const [reportDraft, setReportDraft] = useState("");
  const [reportItems, setReportItems] = useState<MuseReportItem[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportFlash, setReportFlash] = useState<string | null>(null);

  useEffect(() => {
    const restore = parseJsonSafe<{ draft?: string; scope?: ReportScope }>(localStorage.getItem(museReportDraftKey), {});
    setReportDraft(typeof restore.draft === "string" ? restore.draft : "");
    setReportScope(restore.scope === "story" ? "story" : "scene");
  }, [museReportDraftKey]);

  useEffect(() => {
    localStorage.setItem(
      museReportDraftKey,
      JSON.stringify({
        draft: reportDraft,
        scope: reportScope,
      })
    );
  }, [museReportDraftKey, reportDraft, reportScope]);

  const loadReports = useCallback(async () => {
    setReportLoading(true);
    setReportError(null);
    try {
      const qs = reportScope === "scene" ? `?scene_id=${encodeURIComponent(sceneId)}&limit=20` : "?limit=20";
      const res = await fetch(`/api/${storySlug}/muse/analysis${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_REPORT_GET_FAILED_${res.status}`);
      setReportItems(Array.isArray(json?.items) ? (json.items as MuseReportItem[]) : []);
    } catch (e: unknown) {
      setReportItems([]);
      setReportError(e instanceof Error ? e.message : "MUSE_REPORT_GET_FAILED");
    } finally {
      setReportLoading(false);
    }
  }, [reportScope, sceneId, storySlug]);

  useEffect(() => {
    loadReports().catch(() => undefined);
  }, [loadReports]);

  const saveReport = useCallback(async () => {
    const raw = reportDraft.trim();
    if (!raw) {
      setReportError("Report is empty.");
      return;
    }
    setReportSaving(true);
    setReportError(null);
    setReportFlash(null);
    try {
      const payload = {
        scene_id: reportScope === "scene" ? Number(sceneId) : null,
        raw_content_md: raw,
        created_by: "ui",
      };
      const res = await fetch(`/api/${storySlug}/muse/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_REPORT_SAVE_FAILED_${res.status}`);
      setReportDraft("");
      setReportFlash("Report saved.");
      await loadReports();
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : "MUSE_REPORT_SAVE_FAILED");
    } finally {
      setReportSaving(false);
    }
  }, [loadReports, reportDraft, reportScope, sceneId, storySlug]);

  return {
    reportScope,
    setReportScope,
    reportDraft,
    setReportDraft,
    reportItems,
    reportLoading,
    reportSaving,
    reportError,
    reportFlash,
    loadReports,
    saveReport,
  };
}
