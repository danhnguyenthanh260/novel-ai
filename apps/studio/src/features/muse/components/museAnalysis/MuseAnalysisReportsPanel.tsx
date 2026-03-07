import MarkdownPreview from "@/features/muse/components/museAnalysis/MarkdownPreview";
import { toSnippet } from "@/features/muse/components/museAnalysis/utils";
import type { MuseAnalysisItem } from "@/features/muse/components/museAnalysis/types";

type MuseAnalysisReportsPanelProps = {
  items: MuseAnalysisItem[];
  selectedId: string | null;
  setSelectedId: (value: string | null) => void;
  selectedItem: MuseAnalysisItem | null;
  loadingList: boolean;
  deletingId: string | null;
  loadList: () => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
};

export default function MuseAnalysisReportsPanel({
  items,
  selectedId,
  setSelectedId,
  selectedItem,
  loadingList,
  deletingId,
  loadList,
  deleteReport,
}: MuseAnalysisReportsPanelProps) {
  return (
    <div className="surface-card space-y-2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Recent Reports</div>
        <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => loadList().catch(() => undefined)}>
          {loadingList ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`shell-control w-full p-2 text-left text-xs ${selectedId === item.id ? "border-[#3f6b90]" : ""}`}
            onClick={() => setSelectedId(item.id)}
          >
            <div className="muted mb-1 flex items-center justify-between">
              <span>{item.scene_id ? `scene #${item.scene_id}` : "story-level"}</span>
              <span>{new Date(item.created_at).toLocaleString()}</span>
            </div>
            <div className="max-h-10 overflow-hidden break-words">{toSnippet(item.raw_content_md)}</div>
          </button>
        ))}
        {!loadingList && items.length === 0 ? <div className="muted text-xs">No reports found.</div> : null}
      </div>

      <details className="surface-card p-2" open>
        <summary className="cursor-pointer text-xs font-medium">
          Detail {selectedItem ? `(${selectedItem.scene_id ? `scene #${selectedItem.scene_id}` : "story-level"})` : ""}
        </summary>
        <div className="mt-2 space-y-2">
          {selectedItem ? (
            <>
              <div className="shell-control max-h-[240px] overflow-auto p-2 text-xs leading-6">
                <MarkdownPreview markdown={selectedItem.raw_content_md} />
              </div>
              <button
                type="button"
                className="shell-link px-2 py-1 text-xs disabled:opacity-40"
                disabled={deletingId === selectedItem.id}
                onClick={() => deleteReport(selectedItem.id).catch(() => undefined)}
              >
                {deletingId === selectedItem.id ? "Deleting..." : "Delete"}
              </button>
            </>
          ) : (
            <div className="muted text-xs">Select a report to preview full content.</div>
          )}
        </div>
      </details>
    </div>
  );
}
