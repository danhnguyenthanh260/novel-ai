import type { Dispatch, SetStateAction } from "react";
import type { MuseReportItem } from "@/features/scenes/components/draftRunner/shared";

export function DraftReportPanel(props: {
  reportScope: "scene" | "story";
  setReportScope: Dispatch<SetStateAction<"scene" | "story">>;
  reportDraft: string;
  setReportDraft: Dispatch<SetStateAction<string>>;
  reportSaving: boolean;
  saveReport: () => Promise<void>;
  reportLoading: boolean;
  loadReports: () => Promise<void>;
  reportFlash: string | null;
  reportError: string | null;
  reportItems: MuseReportItem[];
}) {
  const {
    reportScope,
    setReportScope,
    reportDraft,
    setReportDraft,
    reportSaving,
    saveReport,
    reportLoading,
    loadReports,
    reportFlash,
    reportError,
    reportItems,
  } = props;

  return (
    <section className="surface-card p-2 text-sm">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="muted">Muse Report</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`shell-link px-2 py-1 ${reportScope === "scene" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setReportScope("scene")}
          >
            Scene
          </button>
          <button
            type="button"
            className={`shell-link px-2 py-1 ${reportScope === "story" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setReportScope("story")}
          >
            Story
          </button>
        </div>
      </div>

      <textarea
        className="shell-control min-h-[180px] w-full p-2 text-sm leading-6"
        placeholder={`Issue:
Evidence:
Why problematic:
Recommendation:
Scope: scene-level | story-level`}
        value={reportDraft}
        onChange={(e) => setReportDraft(e.target.value)}
      />

      <div className="mt-2 flex items-center gap-2 text-xs">
        <button
          type="button"
          className="rounded border border-[#2f5b58] bg-[#133a37] px-3 py-1 text-[#9de5dc] disabled:opacity-40"
          disabled={reportSaving}
          onClick={() => saveReport().catch(() => undefined)}
        >
          {reportSaving ? "Saving..." : "Save Report"}
        </button>
        <button
          type="button"
          className="shell-link px-2 py-1 disabled:opacity-40"
          disabled={reportLoading}
          onClick={() => loadReports().catch(() => undefined)}
        >
          {reportLoading ? "Refreshing..." : "Refresh"}
        </button>
        {reportFlash ? <span className="muted text-xs">{reportFlash}</span> : null}
      </div>
      {reportError ? <div className="mt-2 text-xs text-[#ff8f8f]">{reportError}</div> : null}

      <details className="surface-card mt-2 p-2" open={false}>
        <summary className="cursor-pointer text-xs font-medium">Recent reports ({reportItems.length})</summary>
        <div className="mt-2 space-y-2">
          {reportItems.length === 0 ? (
            <div className="muted text-xs">No reports yet.</div>
          ) : (
            reportItems.map((item) => (
              <div key={item.id} className="shell-control p-2 text-xs">
                <div className="muted mb-1 flex items-center justify-between">
                  <span>{item.scene_id ? `scene #${item.scene_id}` : "story-level"}</span>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <div className="break-words whitespace-pre-wrap">{item.raw_content_md}</div>
              </div>
            ))
          )}
        </div>
      </details>
    </section>
  );
}
