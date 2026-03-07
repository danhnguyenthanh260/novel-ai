"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgentTraceItem,
  type PipelineExecutionNarrative,
  type PipelineGraph,
  type PipelineNodeInspectorLite,
  type PipelineLogItem,
  type PipelineSummary,
  readJson,
} from "../pipelineJobClientTypes";

type InspectorTab = "data" | "config" | "links";

export function usePipelineJobState(storySlug: string, jobId: string) {
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [logs, setLogs] = useState<PipelineLogItem[]>([]);
  const [traceItems, setTraceItems] = useState<AgentTraceItem[]>([]);
  const [inspectorLite, setInspectorLite] = useState<PipelineNodeInspectorLite | null>(null);
  const [graph, setGraph] = useState<PipelineGraph | null>(null);
  const [narrative, setNarrative] = useState<PipelineExecutionNarrative | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("links");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(
    () => `/api/${encodeURIComponent(storySlug)}/pipelines/${encodeURIComponent(jobId)}`,
    [storySlug, jobId],
  );
  const initialNodeFromUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search).get("node");
    return q && q.trim() ? q.trim().toUpperCase() : null;
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const json = (await fetch(base, { cache: "no-store" }).then(readJson)) as PipelineSummary;
      setSummary(json);
      if (!selectedNode && Array.isArray(json.nodes) && json.nodes.length > 0) {
        if (initialNodeFromUrl && json.nodes.some((n) => n.node_key === initialNodeFromUrl)) {
          setSelectedNode(initialNodeFromUrl);
          return;
        }
        const firstProblem =
          json.nodes.find((n) => n.status === "RUNNING")?.node_key ||
          json.nodes.find((n) => n.status === "FAILED" || n.status === "BLOCKED")?.node_key ||
          json.nodes[0].node_key;
        setSelectedNode(firstProblem);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PIPELINE_SUMMARY_LOAD_FAILED");
    } finally {
      setLoadingSummary(false);
    }
  }, [base, selectedNode, initialNodeFromUrl]);

  const loadGraph = useCallback(async () => {
    try {
      setLoadingGraph(true);
      const json = (await fetch(`${base}/graph`, { cache: "no-store" }).then(readJson)) as {
        graph?: PipelineGraph;
        execution_narrative?: PipelineExecutionNarrative;
      };
      const nextGraph = json.graph && Array.isArray(json.graph.nodes) ? json.graph : { nodes: [], edges: [] };
      setGraph(nextGraph);
      setNarrative(json.execution_narrative ?? null);
      if (!selectedNode && nextGraph.nodes.length > 0) {
        const firstInteractive =
          nextGraph.nodes.find((n) => n.status === "RUNNING" && n.kind !== "GROUP" && n.interactive !== false)?.key ||
          nextGraph.nodes.find((n) => (n.status === "FAILED" || n.status === "BLOCKED") && n.kind !== "GROUP" && n.interactive !== false)
            ?.key ||
          nextGraph.nodes.find((n) => n.kind !== "GROUP" && n.interactive !== false)?.key ||
          nextGraph.nodes[0]?.key ||
          null;
        if (firstInteractive) setSelectedNode(firstInteractive);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PIPELINE_GRAPH_LOAD_FAILED");
      setGraph(null);
      setNarrative(null);
    } finally {
      setLoadingGraph(false);
    }
  }, [base, selectedNode]);

  const loadNodeLogs = useCallback(async () => {
    if (!selectedNode) return;
    try {
      setLoadingLogs(true);
      const json = (await fetch(`${base}/nodes/${encodeURIComponent(selectedNode)}/inspector-lite?limit=80`, {
        cache: "no-store",
      }).then(readJson)) as PipelineNodeInspectorLite;
      setInspectorLite(json);
      setLogs(Array.isArray(json?.items) ? json.items : []);
      setTraceItems(Array.isArray(json?.trace_items) ? json.trace_items : []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PIPELINE_NODE_LOGS_LOAD_FAILED");
      setInspectorLite(null);
      setLogs([]);
      setTraceItems([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [base, selectedNode]);

  const retrySelectedNode = useCallback(async () => {
    if (!selectedNode) return;
    const reason = window.prompt("Retry reason (required):", "manual retry from pipeline board");
    if (!reason || !reason.trim()) return;
    try {
      setRetryBusy(true);
      setError(null);
      if (summary?.alerts?.some((a) => a.node_key === selectedNode && a.alert_type === "RETRY_EXHAUSTED")) {
        throw new Error("RETRY_BLOCKED_EXHAUSTED: fix root cause before retry");
      }
      await fetch(`${base}/nodes/${encodeURIComponent(selectedNode)}/retry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), author: "studio" }),
      }).then(readJson);
      await loadSummary();
      await loadNodeLogs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PIPELINE_NODE_RETRY_FAILED");
    } finally {
      setRetryBusy(false);
    }
  }, [base, selectedNode, loadSummary, loadNodeLogs, summary]);

  useEffect(() => {
    void loadSummary();
    void loadGraph();
    const timer = setInterval(() => {
      void loadSummary();
      void loadGraph();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadSummary, loadGraph]);

  useEffect(() => {
    void loadNodeLogs();
  }, [loadNodeLogs]);

  const graphNodeMap = useMemo(() => new Map((graph?.nodes || []).map((n) => [n.key, n])), [graph]);
  const selectedGraphNode = selectedNode ? graphNodeMap.get(selectedNode) || null : null;
  const groupChildrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of graph?.groups || []) {
      map.set(group.key, Array.isArray(group.node_keys) ? group.node_keys : []);
    }
    return map;
  }, [graph]);
  const flowNodes = useMemo(() => {
    const allNodes = graph?.nodes || [];
    return allNodes.filter((n) => !n.group_key && n.kind !== "GROUP");
  }, [graph]);
  const selectedNodeAlert = useMemo(
    () => (summary?.alerts || []).find((a) => a.node_key === selectedNode) || null,
    [summary, selectedNode],
  );
  const activeStrategy = useMemo(() => {
    const phase = narrative?.current_phase || "";
    if (!phase.startsWith("SPLIT_STRATEGY:")) return null;
    return phase.replace("SPLIT_STRATEGY:", "");
  }, [narrative]);
  const rootCauseHint = useMemo(() => {
    if (!selectedNodeAlert) return null;
    if (selectedNodeAlert.alert_type === "RUNNING_TOO_LONG") {
      return "Likely LLM timeout or heavy prompt; check model health, timeout, and payload size.";
    }
    if (selectedNodeAlert.alert_type === "READY_STALLED") {
      return "Worker not claiming READY tasks or job status gate mismatch; check worker process and job status.";
    }
    if (selectedNodeAlert.alert_type === "RETRY_EXHAUSTED") {
      return "Deterministic failure pattern; retry is blocked until root cause is fixed.";
    }
    return null;
  }, [selectedNodeAlert]);
  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  return {
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
  };
}

export type PipelineJobState = ReturnType<typeof usePipelineJobState>;
export type { InspectorTab };
