"use client";

import Link from "next/link";
import {
  type AgentTraceItem,
  type PipelineGraphNode,
  type PipelineNodeInspectorLite,
  type PipelineLogItem,
} from "../pipelineJobClientTypes";

type InspectorTab = "data" | "config" | "links";

type Props = {
  storySlug: string;
  selectedNode: string | null;
  selectedGraphNode: PipelineGraphNode | null;
  inspectorTab: InspectorTab;
  loadingLogs: boolean;
  retryBusy: boolean;
  rootCauseHint: string | null;
  inspectorLite: PipelineNodeInspectorLite | null;
  logs: PipelineLogItem[];
  traceItems: AgentTraceItem[];
  onChangeTab: (tab: InspectorTab) => void;
  onRefreshLogs: () => void;
  onRetry: () => void;
};

function InspectorTabs({
  inspectorTab,
  onChangeTab,
}: {
  inspectorTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${inspectorTab === "data" ? "border-[#9de5dc]/50 text-[#9de5dc]" : ""}`}
        onClick={() => onChangeTab("data")}
      >
        Data
      </button>
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${inspectorTab === "config" ? "border-[#9de5dc]/50 text-[#9de5dc]" : ""}`}
        onClick={() => onChangeTab("config")}
      >
        Config
      </button>
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${inspectorTab === "links" ? "border-[#9de5dc]/50 text-[#9de5dc]" : ""}`}
        onClick={() => onChangeTab("links")}
      >
        Links
      </button>
    </>
  );
}

function PipelineLinks({
  storySlug,
  selectedNode,
  inspectorLite,
}: {
  storySlug: string;
  selectedNode: string | null;
  inspectorLite: PipelineNodeInspectorLite | null;
}) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
      <Link
        href={`/stories/${encodeURIComponent(storySlug)}/pipelines/${inspectorLite?.job_id ?? ""}?node=${encodeURIComponent(selectedNode || "")}`}
        className="shell-link px-2 py-1 text-xs"
      >
        Open Pipeline Node
      </Link>
      <Link
        href={inspectorLite?.links?.prompt_registry_url || `/stories/${encodeURIComponent(storySlug)}/agents?tab=prompts`}
        className="shell-link px-2 py-1 text-xs"
      >
        Open Prompt Registry
      </Link>
      <Link
        href={inspectorLite?.links?.run_trace_url || `/stories/${encodeURIComponent(storySlug)}/agents?tab=runs`}
        className="shell-link px-2 py-1 text-xs"
      >
        Open Run Logs
      </Link>
      <div className="rounded border border-[#2A3441] bg-[#0b1220] px-2 py-1 text-xs text-slate-300">
        markers: {Array.isArray(inspectorLite?.fallback_markers) && inspectorLite?.fallback_markers.length > 0
          ? inspectorLite.fallback_markers.join(", ")
          : "-"}
      </div>
    </div>
  );
}

function LogsTable({ logs }: { logs: PipelineLogItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Event</th>
            <th className="px-2 py-1">Task</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Message</th>
            <th className="px-2 py-1">Error</th>
            <th className="px-2 py-1">Created</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => (
            <tr key={row.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2 font-mono">{row.id}</td>
              <td className="px-2 py-2 font-mono">{row.task_id ?? "-"}</td>
              <td className="px-2 py-2">{row.status}</td>
              <td className="px-2 py-2">{row.message || "-"}</td>
              <td className="px-2 py-2 text-rose-300">{row.error_code || "-"}</td>
              <td className="px-2 py-2">{new Date(row.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {logs.length === 0 ? (
            <tr>
              <td className="muted px-2 py-4 text-sm" colSpan={6}>
                No logs for this node yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function TraceTable({ traceItems }: { traceItems: AgentTraceItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Trace</th>
            <th className="px-2 py-1">Task</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Error</th>
            <th className="px-2 py-1">Latency</th>
            <th className="px-2 py-1">Prompt Version</th>
            <th className="px-2 py-1">Created</th>
          </tr>
        </thead>
        <tbody>
          {traceItems.map((row) => (
            <tr key={row.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2 font-mono">{row.id}</td>
              <td className="px-2 py-2 font-mono">{row.task_id ?? "-"}</td>
              <td className="px-2 py-2">{row.agent_name}</td>
              <td className="px-2 py-2">{row.status}</td>
              <td className="px-2 py-2 text-rose-300">{row.error_code || "-"}</td>
              <td className="px-2 py-2">{row.latency_ms ?? "-"}</td>
              <td className="px-2 py-2">{row.prompt_version_id ?? "-"}</td>
              <td className="px-2 py-2">{new Date(row.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {traceItems.length === 0 ? (
            <tr>
              <td className="muted px-2 py-4 text-sm" colSpan={8}>
                No agent traces for this node yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function NodeInspectorPanel({
  storySlug,
  selectedNode,
  selectedGraphNode,
  inspectorTab,
  loadingLogs,
  retryBusy,
  rootCauseHint,
  inspectorLite,
  logs,
  traceItems,
  onChangeTab,
  onRefreshLogs,
  onRetry,
}: Props) {
  const isInteractive = selectedGraphNode?.interactive !== false;
  const dataBlock = inspectorLite?.data || selectedGraphNode?.inspector?.data || {};
  const configBlock = inspectorLite?.config || selectedGraphNode?.inspector?.config || {};

  return (
    <>
      <section className="surface-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-200">Node Inspector Lite {selectedNode ? `(${selectedNode})` : ""}</div>
          <div className="flex items-center gap-2">
            <InspectorTabs inspectorTab={inspectorTab} onChangeTab={onChangeTab} />
            {selectedNode && isInteractive ? (
              <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onRefreshLogs} disabled={loadingLogs}>
                {loadingLogs ? "Loading..." : "Refresh Logs"}
              </button>
            ) : null}
            {selectedNode && inspectorTab === "links" && isInteractive ? (
              <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onRetry} disabled={retryBusy}>
                {retryBusy ? "Retrying..." : "Retry Node"}
              </button>
            ) : null}
          </div>
        </div>
        {selectedNode && !isInteractive ? (
          <div className="mb-3 rounded border border-cyan-700/40 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
            This is an orchestrator/system node. Select an interactive task node to view raw logs and retry actions.
          </div>
        ) : null}
        {selectedGraphNode && inspectorTab === "data" ? (
          <pre className="mb-3 max-h-64 overflow-auto rounded border border-[#2A3441] bg-[#0b1220] p-2 text-xs text-slate-200">
            {JSON.stringify(dataBlock, null, 2)}
          </pre>
        ) : null}
        {selectedGraphNode && inspectorTab === "config" ? (
          <pre className="mb-3 max-h-64 overflow-auto rounded border border-[#2A3441] bg-[#0b1220] p-2 text-xs text-slate-200">
            {JSON.stringify(configBlock, null, 2)}
          </pre>
        ) : null}
        {inspectorTab === "links" && rootCauseHint ? (
          <div className="mb-3 rounded border border-amber-700/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            root_cause_hint: {rootCauseHint}
          </div>
        ) : null}
        {inspectorTab === "links" ? (
          <>
            <PipelineLinks storySlug={storySlug} selectedNode={selectedNode} inspectorLite={inspectorLite} />
            {inspectorLite?.ops_meta ? (
              <div className="mb-3 rounded border border-[#2A3441] bg-[#0b1220] p-2 text-xs text-slate-300">
                <div className="mb-1 font-medium text-slate-200">Ops Meta</div>
                <div>strategy: {inspectorLite.ops_meta.strategy_selected ?? "-"}</div>
                <div>learning_mode: {inspectorLite.ops_meta.learning_mode ?? "-"}</div>
                <div>learning_applied: {String(Boolean(inspectorLite.ops_meta.learning_applied))}</div>
                <div>profile_decay_factor: {inspectorLite.ops_meta.profile_decay_factor ?? "-"}</div>
                <div>profile_reset_scope: {inspectorLite.ops_meta.profile_reset_scope ?? "-"}</div>
                <div>truth_conflicts: {inspectorLite.ops_meta.truth_conflicts?.length ?? 0}</div>
                <div>shadow_pairs: {inspectorLite.ops_meta.shadow_pairs?.length ?? 0}</div>
                {(inspectorLite.ops_meta.truth_conflicts?.length ?? 0) > 0 ? (
                  <div className="mt-1 max-h-28 overflow-auto rounded border border-[#2A3441] p-1 text-[11px]">
                    {inspectorLite.ops_meta.truth_conflicts.slice(0, 3).map((c) => (
                      <div key={c.id} className="mb-1 border-b border-[#2A3441] pb-1 last:mb-0 last:border-b-0 last:pb-0">
                        <div className="text-slate-200">{c.conflict_id}</div>
                        <div className="text-slate-400">winner: {c.winning_rule_ref}</div>
                        <div className="text-slate-400">loser: {c.losing_rule_ref}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {(inspectorLite.ops_meta.shadow_pairs?.length ?? 0) > 0 ? (
                  <div className="mt-1 max-h-28 overflow-auto rounded border border-[#2A3441] p-1 text-[11px]">
                    {inspectorLite.ops_meta.shadow_pairs?.slice(0, 3).map((s) => (
                      <div key={s.id} className="mb-1 border-b border-[#2A3441] pb-1 last:mb-0 last:border-b-0 last:pb-0">
                        <div className="text-slate-200">pair #{s.id} ({s.pair_status})</div>
                        <div className="text-slate-400">shadow_prompt: {s.shadow_prompt_version_id ?? "-"}</div>
                        <div className="text-slate-400">{new Date(s.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        <LogsTable logs={logs} />
      </section>

      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Agent Trace {selectedNode ? `(${selectedNode})` : ""}</div>
        <TraceTable traceItems={traceItems} />
      </section>
    </>
  );
}
