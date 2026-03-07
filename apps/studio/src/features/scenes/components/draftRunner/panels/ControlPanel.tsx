type RunningAction = "none" | "commit" | "consistency" | "evaluate" | "rewrite" | "lock" | "autowrite";

export function DraftControlPanel(props: {
  checkConsistency: () => Promise<void>;
  evaluateScene: () => Promise<void>;
  rewriteTargeted: () => Promise<void>;
  runAutoWrite: () => Promise<void>;
  lockScene: () => Promise<void>;
  commitVersion: () => Promise<void>;
  canCheckConsistency: boolean;
  canEvaluate: boolean;
  canRewrite: boolean;
  canAutoWrite: boolean;
  canLock: boolean;
  canCommit: boolean;
  runningAction: RunningAction;
  approxTokens: number;
  maxContextTokens: number;
  budgetColor: string;
  sceneId: string;
  currentVersionNo: number | null;
  sceneStatus: string;
  sceneChars: number;
  globalChars: number;
  localChars: number;
  lastGuardTokens: number;
  lastCheckedAt: string | null;
  budgetPct: number;
}) {
  const {
    checkConsistency,
    evaluateScene,
    rewriteTargeted,
    runAutoWrite,
    lockScene,
    commitVersion,
    canCheckConsistency,
    canEvaluate,
    canRewrite,
    canAutoWrite,
    canLock,
    canCommit,
    runningAction,
    approxTokens,
    maxContextTokens,
    budgetColor,
    sceneId,
    currentVersionNo,
    sceneStatus,
    sceneChars,
    globalChars,
    localChars,
    lastGuardTokens,
    lastCheckedAt,
    budgetPct,
  } = props;

  return (
    <section className="surface-card p-2 transition">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="muted">Control Panel</div>
        <div className="muted">Right dock</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="shell-link px-3 py-1 text-xs disabled:opacity-40" onClick={() => checkConsistency().catch(() => undefined)} disabled={!canCheckConsistency}>
          {runningAction === "consistency" ? "Checking..." : "Check Consistency"}
        </button>
        <button type="button" className="shell-link px-3 py-1 text-xs disabled:opacity-40" onClick={() => evaluateScene().catch(() => undefined)} disabled={!canEvaluate}>
          {runningAction === "evaluate" ? "Evaluating..." : "Evaluate"}
        </button>
        <button type="button" className="shell-link px-3 py-1 text-xs disabled:opacity-40" onClick={() => rewriteTargeted().catch(() => undefined)} disabled={!canRewrite}>
          {runningAction === "rewrite" ? "Rewriting..." : "Rewrite Targeted"}
        </button>
        <button type="button" className="shell-link px-3 py-1 text-xs disabled:opacity-40" onClick={() => runAutoWrite().catch(() => undefined)} disabled={!canAutoWrite}>
          {runningAction === "autowrite" ? "AutoWriting..." : "AutoWrite v1"}
        </button>
        <button type="button" className="shell-link px-3 py-1 text-xs disabled:opacity-40" onClick={() => lockScene().catch(() => undefined)} disabled={!canLock}>
          {runningAction === "lock" ? "Locking..." : "Lock"}
        </button>
        <button type="button" className="rounded border border-[#2f5b58] bg-[#133a37] px-3 py-1 text-xs text-[#9de5dc] disabled:opacity-40" onClick={() => commitVersion().catch(() => undefined)} disabled={!canCommit}>
          {runningAction === "commit" ? "Committing..." : "Commit Version"}
        </button>
        <div className="shell-control flex items-center gap-2 px-2 py-1 text-[11px]">
          <span className="muted">Budget</span>
          <span>{approxTokens}/{maxContextTokens}</span>
          <span className={`inline-block h-1.5 w-14 rounded ${budgetColor}`} />
        </div>
        <div className="muted ml-auto text-xs">scene #{sceneId} | v{currentVersionNo ?? "-"} | status {sceneStatus}</div>
      </div>

      <div className="muted mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <span>Scene chars</span>
        <span className="text-right">{sceneChars}</span>
        <span>Global chars</span>
        <span className="text-right">{globalChars}</span>
        <span>Local chars</span>
        <span className="text-right">{localChars}</span>
        <span>Guard tokens</span>
        <span className="text-right">{lastGuardTokens || "-"}</span>
        <span>Last checked</span>
        <span className="text-right">{lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : "-"}</span>
      </div>

      <div className="muted mt-1 text-[11px]">
        Allowed now:{" "}
        {[
          canCheckConsistency ? "Check" : null,
          canEvaluate ? "Evaluate" : null,
          canRewrite ? "Rewrite" : null,
          canAutoWrite ? "AutoWrite" : null,
          canCommit ? "Commit" : null,
          canLock ? "Lock" : null,
        ]
          .filter(Boolean)
          .join(" | ") || "No write action"}
      </div>

      {budgetPct > 85 ? (
        <div className="mt-1 rounded border border-[#6f3a3a] bg-[#3b1a1a] p-2 text-[11px] text-[#ffb4b4]">
          Consider reducing TAGGED worldbuilding or commit scene before rewrite.
        </div>
      ) : null}
    </section>
  );
}
