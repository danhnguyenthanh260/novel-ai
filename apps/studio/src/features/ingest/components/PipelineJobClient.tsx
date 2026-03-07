"use client";

import Link from "next/link";
import { formatAlertMessage } from "./pipelineJobClientTypes";
import { statusClass } from "./pipelineJob/statusClass";
import ExecutionNarrativeCard from "./pipelineJob/ExecutionNarrativeCard";
import VisualPathPanel from "./pipelineJob/VisualPathPanel";
import NodeInspectorPanel from "./pipelineJob/NodeInspectorPanel";
import { usePipelineJobState } from "./pipelineJob/usePipelineJobState";

export default function PipelineJobClient({ storySlug, jobId }: { storySlug: string; jobId: string }) {
  const {
    summary,
    selectedNode,
    logs,
    traceItems,
    inspectorLite,
    graph,
    narrative,
    loadingGraph,
    expandedGroups,
    inspectorTab,
    loadingSummary,
    loadingLogs,
    retryBusy,
    error,
    graphNodeMap,
    selectedGraphNode,
    groupChildrenMap,
    flowNodes,
    activeStrategy,
    rootCauseHint,
    setSelectedNode,
    setInspectorTab,
    loadSummary,
    loadGraph,
    loadNodeLogs,
    retrySelectedNode,
    toggleGroup,
  } = usePipelineJobState(storySlug, jobId);

  return (
    <main className="space-y-4 p-2 md:p-4">
      <section className="surface-card flex items-center justify-between p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline Node View</h1>
          <div className="muted text-sm">
            story: {storySlug} | job: #{jobId}
          </div>
          {summary ? (
            <div className="muted text-xs">
              flow: {summary.flow_type} | status: {summary.job_status} | current: {summary.current_node || "-"} | progress:{" "}
              {summary.progress_pct}%
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="shell-link px-3 py-2 text-sm" onClick={() => void loadSummary()} disabled={loadingSummary}>
            {loadingSummary ? "Refreshing..." : "Refresh"}
          </button>
          <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest`} className="shell-link px-3 py-2 text-sm">
            Back To Ingest
          </Link>
        </div>
      </section>

      {error ? <div className="text-sm text-[#ff8f8f]">{error}</div> : null}
      {summary?.last_error ? (
        <div className="rounded border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          last_error: {summary.last_error}
        </div>
      ) : null}
      {summary?.blocking_reason ? (
        <div className="rounded border border-amber-700/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          blocking_reason: {summary.blocking_reason}
          {Array.isArray(summary.blocked_nodes) && summary.blocked_nodes.length > 0
            ? ` | blocked_nodes: ${summary.blocked_nodes.join(", ")}`
            : ""}
        </div>
      ) : null}
      {Array.isArray(summary?.alerts) && summary.alerts.length > 0 ? (
        <section className="surface-card p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">Active Alerts</div>
          <div className="space-y-2">
            {summary.alerts.map((a) => (
              <button
                key={`${a.node_key}:${a.alert_type}`}
                type="button"
                className="w-full rounded border border-rose-700/40 bg-rose-950/40 px-3 py-2 text-left text-xs text-rose-200"
                onClick={() => setSelectedNode(a.node_key)}
              >
                {a.alert_type}: {formatAlertMessage(a)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ExecutionNarrativeCard narrative={narrative} />

      <VisualPathPanel
        graph={graph}
        flowNodes={flowNodes}
        graphNodeMap={graphNodeMap}
        groupChildrenMap={groupChildrenMap}
        expandedGroups={expandedGroups}
        selectedNode={selectedNode}
        activeStrategy={activeStrategy}
        loadingGraph={loadingGraph}
        onRefresh={() => void loadGraph()}
        onSelectNode={setSelectedNode}
        onToggleGroup={toggleGroup}
      />
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Nodes</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
          {(summary?.nodes || []).map((node) => {
            const active = selectedNode === node.node_key;
            return (
              <button
                key={node.node_key}
                type="button"
                onClick={() => setSelectedNode(node.node_key)}
                className={`rounded border px-3 py-2 text-left transition-colors ${statusClass(node.status)} ${
                  active ? "ring-1 ring-[#9de5dc]/60" : ""
                }`}
              >
                <div className="text-xs font-semibold">{node.node_key}</div>
                <div className="text-xs opacity-90">status: {node.status}</div>
                <div className="text-xs opacity-90">tasks: {node.total_tasks}</div>
              </button>
            );
          })}
        </div>
      </section>

      <NodeInspectorPanel
        storySlug={storySlug}
        selectedNode={selectedNode}
        selectedGraphNode={selectedGraphNode}
        inspectorTab={inspectorTab}
        loadingLogs={loadingLogs}
        retryBusy={retryBusy}
        rootCauseHint={rootCauseHint}
        inspectorLite={inspectorLite}
        logs={logs}
        traceItems={traceItems}
        onChangeTab={setInspectorTab}
        onRefreshLogs={() => void loadNodeLogs()}
        onRetry={() => void retrySelectedNode()}
      />
    </main>
  );
}
