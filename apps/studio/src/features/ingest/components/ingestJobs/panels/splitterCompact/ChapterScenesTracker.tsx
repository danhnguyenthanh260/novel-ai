import type { SplitDraftData } from "@/features/ingest/components/ingestJobs/types";

type SplitDraftChapter = SplitDraftData["chapters"][number];
export type ScenesTrackerChapterData = Pick<
  SplitDraftChapter,
  "operational_state" | "analysis_chunk_artifact" | "analysis_chunk_diagnostics" | "scenes"
>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter((entry) => entry.trim().length > 0);
}

export function ChapterScenesTracker({ chapter }: { chapter: ScenesTrackerChapterData }) {
  const artifact = asRecord(chapter.analysis_chunk_artifact);
  const artifactDiagnosticsFromArtifact = asRecord(artifact.diagnostics);
  const artifactDiagnosticsFromRow = asRecord(chapter.analysis_chunk_diagnostics);
  const diagnostics =
    Object.keys(artifactDiagnosticsFromRow).length > 0 ? artifactDiagnosticsFromRow : artifactDiagnosticsFromArtifact;
  const hasDiagnostics = Object.keys(diagnostics).length > 0;

  const artifactStatus = typeof artifact.status === "string" ? artifact.status : "UNKNOWN";
  const oversizedCount = Number(diagnostics.oversized_count ?? 0);
  const maxChunkCharsObserved = Number(diagnostics.max_chunk_chars_observed ?? 0);
  const repairAttempted = Boolean(diagnostics.repair_attempted);
  const repairExhausted = Boolean(diagnostics.repair_exhausted);
  const violations = asStringArray(diagnostics.violations);

  return (
    <div className="space-y-2 text-[11px] text-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-[#2A3441] px-2 py-0.5">scenes {chapter.scenes.length}</span>
        <span className="rounded border border-[#2A3441] px-2 py-0.5">artifact {artifactStatus}</span>
        <span className="rounded border border-[#2A3441] px-2 py-0.5">oversized {oversizedCount}</span>
        <span className="rounded border border-[#2A3441] px-2 py-0.5">max_chunk_chars {maxChunkCharsObserved}</span>
        {String(chapter.operational_state || "").toUpperCase() === "NEEDS_RETRY" ? (
          <span className="rounded border border-rose-500/40 bg-rose-900/20 px-2 py-0.5 text-rose-200">NEEDS_RETRY</span>
        ) : null}
        {oversizedCount > 0 ? (
          <span className="rounded border border-amber-500/40 bg-amber-900/20 px-2 py-0.5 text-amber-200">OVERSIZED</span>
        ) : null}
        {chapter.scenes.length === 0 ? (
          <span className="rounded border border-rose-500/40 bg-rose-900/20 px-2 py-0.5 text-rose-200">NO_SCENES</span>
        ) : null}
      </div>

      <div className="rounded border border-[#223247] bg-[#0a1220] p-2">
        <div className="mb-1 text-[11px] text-slate-300">Artifact Diagnostics</div>
        {hasDiagnostics ? (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-slate-400">repair_attempted</span>
              <span>{repairAttempted ? "yes" : "no"}</span>
              <span className="text-slate-400">repair_exhausted</span>
              <span>{repairExhausted ? "yes" : "no"}</span>
            </div>
            {violations.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {violations.map((violation) => (
                  <span key={violation} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                    {violation}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-slate-300">Diagnostics unavailable in current payload.</div>
        )}
      </div>

      <div className="space-y-2">
        {chapter.scenes.length === 0 ? (
          <div className="rounded border border-[#223247] bg-[#0a1220] px-2 py-2 text-slate-300">
            No scenes produced for this chapter split output.
          </div>
        ) : (
          chapter.scenes.map((scene) => {
            const start = Number(scene.start ?? 0);
            const end = Number(scene.end ?? 0);
            const length = Math.max(0, end - start);
            const flags = Array.isArray(scene.flags) ? scene.flags.map((entry) => String(entry)) : [];
            return (
              <div key={`${scene.idx}:${start}:${end}`} className="rounded border border-[#223247] bg-[#0a1220] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-[#2A3441] px-2 py-0.5">scene #{scene.idx}</span>
                  <span className="rounded border border-[#2A3441] px-2 py-0.5">
                    chars {start}-{end} ({length})
                  </span>
                  {scene.title ? (
                    <span className="rounded border border-[#2A3441] px-2 py-0.5 text-slate-100">{scene.title}</span>
                  ) : null}
                </div>
                {scene.reason ? <div className="mt-1 text-slate-300">reason: {scene.reason}</div> : null}
                {flags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {flags.map((flag) => (
                      <span key={flag} className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">
                        {flag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {scene.head_excerpt ? (
                  <div className="mt-1">
                    <div className="text-[10px] text-slate-400">head_excerpt</div>
                    <pre className="mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#09101b] p-2 text-[10px] text-slate-200">
                      {scene.head_excerpt}
                    </pre>
                  </div>
                ) : null}
                {scene.tail_excerpt ? (
                  <div className="mt-1">
                    <div className="text-[10px] text-slate-400">tail_excerpt</div>
                    <pre className="mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#09101b] p-2 text-[10px] text-slate-200">
                      {scene.tail_excerpt}
                    </pre>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
