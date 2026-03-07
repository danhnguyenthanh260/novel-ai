"use client";

import { type PipelineGraph, type PipelineGraphNode } from "../pipelineJobClientTypes";
import { statusClass } from "./statusClass";

type Props = {
  graph: PipelineGraph | null;
  flowNodes: PipelineGraphNode[];
  graphNodeMap: Map<string, PipelineGraphNode>;
  groupChildrenMap: Map<string, string[]>;
  expandedGroups: Record<string, boolean>;
  selectedNode: string | null;
  activeStrategy: string | null;
  loadingGraph: boolean;
  onRefresh: () => void;
  onSelectNode: (nodeKey: string) => void;
  onToggleGroup: (groupKey: string) => void;
};

export default function VisualPathPanel({
  graph,
  flowNodes,
  graphNodeMap,
  groupChildrenMap,
  expandedGroups,
  selectedNode,
  activeStrategy,
  loadingGraph,
  onRefresh,
  onSelectNode,
  onToggleGroup,
}: Props) {
  return (
    <section className="surface-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-200">Visual Path</div>
        <div className="flex items-center gap-2">
          {activeStrategy ? (
            <span className="rounded border border-cyan-700/40 bg-cyan-950/30 px-2 py-1 text-xs text-cyan-200">
              strategy: {activeStrategy}
            </span>
          ) : null}
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onRefresh} disabled={loadingGraph}>
            {loadingGraph ? "Loading..." : "Refresh Graph"}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {flowNodes.map((node, idx) => {
          const active = selectedNode === node.key;
          const interactive = node.interactive !== false;
          const childKeys = groupChildrenMap.get(node.key) || [];
          const hasChildren = childKeys.length > 0;
          const childrenExpanded = !!expandedGroups[node.key];
          const childNodes = childKeys
            .map((key) => graphNodeMap.get(key))
            .filter((value): value is PipelineGraphNode => Boolean(value));
          return (
            <div key={node.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (interactive) onSelectNode(node.key);
                  }}
                  disabled={!interactive}
                  className={`rounded border px-3 py-2 text-left transition-colors ${statusClass(node.status)} ${
                    active ? "ring-1 ring-[#9de5dc]/60" : ""
                  } ${interactive ? "" : "cursor-default opacity-80"}`}
                >
                  <div className="text-xs font-semibold">{node.label}</div>
                  <div className="text-xs opacity-90">{node.key}</div>
                  <div className="text-xs opacity-90">status: {node.status}</div>
                </button>
                {hasChildren ? (
                  <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => onToggleGroup(node.key)}>
                    {childrenExpanded ? "Collapse Group" : "Expand Group"}
                  </button>
                ) : null}
              </div>
              {hasChildren && childrenExpanded ? (
                <div className="rounded border border-[#2A3441] bg-[#0b1220] p-2">
                  <div className="mb-2 text-xs text-slate-400">Sub-flow: {node.key}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {childNodes.map((child, childIdx) => {
                      const childActive = selectedNode === child.key;
                      const childInteractive = child.interactive !== false;
                      return (
                        <div key={child.key} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (childInteractive) onSelectNode(child.key);
                            }}
                            disabled={!childInteractive}
                            className={`rounded border px-3 py-2 text-left ${statusClass(child.status)} ${
                              childActive ? "ring-1 ring-[#9de5dc]/60" : ""
                            } ${childInteractive ? "" : "cursor-default opacity-80"}`}
                          >
                            <div className="text-xs font-semibold">{child.label}</div>
                            <div className="text-xs opacity-90">{child.key}</div>
                            <div className="text-xs opacity-90">status: {child.status}</div>
                          </button>
                          {childIdx < childNodes.length - 1 ? <span className="muted text-xs">-&gt;</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {idx < flowNodes.length - 1 ? <div className="muted pl-2 text-xs">|</div> : null}
            </div>
          );
        })}
        {flowNodes.length === 0 ? <div className="muted text-xs">No graph nodes yet.</div> : null}
      </div>
      <div className="mt-3 rounded border border-[#2A3441] bg-[#0b1220] p-2">
        <div className="mb-2 text-xs text-slate-400">Edge Status</div>
        <div className="flex flex-wrap gap-2">
          {(graph?.edges || []).map((edge) => (
            <div key={edge.key} className={`rounded border px-2 py-1 text-xs ${statusClass(edge.status)}`}>
              {edge.source} -&gt; {edge.target} ({edge.status})
            </div>
          ))}
          {(graph?.edges || []).length === 0 ? <div className="muted text-xs">No edges yet.</div> : null}
        </div>
      </div>
    </section>
  );
}
