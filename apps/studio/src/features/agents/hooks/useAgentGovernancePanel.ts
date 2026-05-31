/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PROMOTION_REASON_TEMPLATES } from "../shared/agentGovernanceConstants";
import { useAgentGovernanceActions } from "./useAgentGovernanceActions";
import { useAgentDrawerPolling } from "./useAgentDrawerPolling";
import { useAgentGovernanceData } from "./useAgentGovernanceData";
import type {
  AgentAlert,
  AgentControlTab,
  AgentDrawerTab,
  AgentRunDetail,
  PromptDiffChunk,
} from "../shared/types";

export function useAgentGovernancePanel({ storySlug }: { storySlug: string }) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const base = useMemo(() => `/api/stories/${encodeURIComponent(storySlug)}/agents`, [storySlug]);
  const [agentNameFilter, setAgentNameFilter] = useState("");
  const {
    loading,
    metrics,
    runs,
    prompts,
    experiments,
    feedbacks,
    memories,
    setMemories,
    tuningEvents,
    coverageItems,
    coverageSummary,
    alerts,
    setAlerts,
    promptImpact,
    shadowCompare,
    errorTaxonomy,
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    profileSlots,
    profileEvents,
    loadAll,
  } = useAgentGovernanceData({ base, agentNameFilter, setError });
  const [shadowPairStatusFilter, setShadowPairStatusFilter] = useState<"ALL" | "PLANNED" | "PAIRED" | "COMPARED" | "FAILED">("ALL");
  const [shadowSort, setShadowSort] = useState<"latency_abs" | "latency" | "token_in" | "token_out" | "created">("latency_abs");
  const [activeTab, setActiveTab] = useState<AgentControlTab>("overview");
  const [feedbackAgent, setFeedbackAgent] = useState("NARRATIVE_STYLIST");
  const [feedbackType, setFeedbackType] = useState("FIX");
  const [feedbackText, setFeedbackText] = useState("");
  const [retrieveEmbedding, setRetrieveEmbedding] = useState("");
  const [diffLeft, setDiffLeft] = useState<number | "">("");
  const [diffRight, setDiffRight] = useState<number | "">("");
  const [diffChunks, setDiffChunks] = useState<PromptDiffChunk[]>([]);
  const [runDetail, setRunDetail] = useState<AgentRunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [focusRunId, setFocusRunId] = useState<number | null>(null);
  const [focusPromptVersionId, setFocusPromptVersionId] = useState<number | null>(null);
  const [selectedAgentName, setSelectedAgentName] = useState("");
  const [drawerTab, setDrawerTab] = useState<AgentDrawerTab>("overview");
  const {
    drawerLoading,
    drawerData,
    setDrawerData,
    drawerVisualForm,
    setDrawerVisualForm,
    savingVisual,
    setSavingVisual,
    levelUpPulse,
  } = useAgentDrawerPolling({ base, selectedAgentName, setAlerts, setError });
  const [actionModal, setActionModal] = useState<{ mode: "archive" | "rollback" | "promote_active"; versionId: number } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [rollbackTargetVersion, setRollbackTargetVersion] = useState<number | "">("");
  const [promoteAuthor, setPromoteAuthor] = useState("studio");
  const [promoteApprovedBy, setPromoteApprovedBy] = useState("");
  const [promoteReasonTemplate, setPromoteReasonTemplate] =
    useState<(typeof PROMOTION_REASON_TEMPLATES)[number]>("CANARY_SUCCESS");
  const [promoteLookbackHours, setPromoteLookbackHours] = useState<number | "">(168);
  const [promoteMinSamples, setPromoteMinSamples] = useState<number | "">(20);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (selectedAgentName) return;
    const fromFilter = agentNameFilter.trim();
    if (fromFilter) {
      setSelectedAgentName(fromFilter);
      return;
    }
    const firstMetric = metrics[0]?.agent_name;
    const firstRun = runs[0]?.agent_name;
    const firstPrompt = prompts[0]?.agent_name;
    const firstProfile = profiles[0]?.species_name;
    const fallback = firstMetric || firstRun || firstPrompt || firstProfile || "";
    if (fallback) setSelectedAgentName(fallback);
  }, [agentNameFilter, metrics, prompts, profiles, runs, selectedAgentName]);

  const {
    openPromoteActiveModal,
    onPromoteCanary,
    openArchiveModal,
    openRollbackModal,
    closeActionModal,
    submitActionModal,
    onPauseExperiment,
    onRollbackExperiment,
    onViewSnapshot,
    onViewRunDetail,
    onRunDiff,
    onCreateFeedback,
    onMuteFeedback,
    onRetrieveMemory,
    onSaveVisualProfile,
  } = useAgentGovernanceActions({
    base,
    loadAll,
    setError,
    actionModal,
    setActionModal,
    actionReason,
    setActionReason,
    rollbackTargetVersion,
    setRollbackTargetVersion,
    promoteAuthor,
    setPromoteAuthor,
    promoteApprovedBy,
    setPromoteApprovedBy,
    promoteReasonTemplate,
    setPromoteReasonTemplate,
    promoteLookbackHours,
    setPromoteLookbackHours,
    promoteMinSamples,
    setPromoteMinSamples,
    actionBusy,
    setActionBusy,
    setRunDetailLoading,
    setRunDetail,
    diffLeft,
    diffRight,
    setDiffChunks,
    feedbackText,
    setFeedbackText,
    feedbackAgent,
    feedbackType,
    retrieveEmbedding,
    setMemories,
    selectedAgentName,
    drawerData,
    drawerVisualForm,
    setSavingVisual,
    setDrawerData,
  });

  useEffect(() => {
    const tabRaw = searchParams.get("tab");
    const runIdRaw = searchParams.get("run_id");
    const versionIdRaw = searchParams.get("version_id");
    const validTabs = new Set<AgentControlTab>(["overview", "runs", "prompts", "experiments", "feedback", "memory"]);
    if (tabRaw && validTabs.has(tabRaw as AgentControlTab)) {
      setActiveTab(tabRaw as AgentControlTab);
    }

    const runId = runIdRaw ? Number(runIdRaw) : NaN;
    if (Number.isFinite(runId) && runId > 0) {
      setFocusRunId(runId);
      setActiveTab("runs");
      void onViewRunDetail(runId);
    }

    const versionId = versionIdRaw ? Number(versionIdRaw) : NaN;
    if (Number.isFinite(versionId) && versionId > 0) {
      setFocusPromptVersionId(versionId);
      setActiveTab("prompts");
      setDiffRight(versionId);
    }
  }, [searchParams, onViewRunDetail]);

  const selectedAgentAlerts = useMemo(() => {
    const key = selectedAgentName.trim().toUpperCase();
    if (!key) return [] as AgentAlert[];
    return alerts.filter((a) => String(a.agent_name || "").toUpperCase() === key);
  }, [alerts, selectedAgentName]);

  const quickRollbackCandidate = useMemo(() => {
    const recent = drawerData?.prompt_summary?.recent;
    const activeId = drawerData?.prompt_summary?.active?.version_id;
    if (!recent || recent.length === 0 || !activeId) return null;
    return recent.find((x) => Number(x.version_id) !== Number(activeId)) ?? null;
  }, [drawerData]);

  const drawerXpProgress = useMemo(() => {
    const xp = Math.max(0, Number(drawerData?.identity?.experience_pts ?? 0));
    const level = Math.max(1, Number(drawerData?.identity?.level ?? 1));
    const floorXp = Math.pow(level - 1, 2) * 1000;
    const nextXp = Math.pow(level, 2) * 1000;
    const den = Math.max(1, nextXp - floorXp);
    const pctValue = Math.max(0, Math.min(100, ((xp - floorXp) / den) * 100));
    return {
      xp,
      floorXp,
      nextXp,
      toNext: Math.max(0, nextXp - xp),
      pct: pctValue,
    };
  }, [drawerData?.identity?.experience_pts, drawerData?.identity?.level]);

  const shadowCompareView = useMemo(() => {
    const key = selectedAgentName.trim().toUpperCase();
    const filteredByAgent = key ? shadowCompare.filter((x) => String(x.agent_name || "").toUpperCase() === key) : shadowCompare;
    const filtered = shadowPairStatusFilter === "ALL"
      ? filteredByAgent
      : filteredByAgent.filter((x) => String(x.pair_status || "").toUpperCase() === shadowPairStatusFilter);
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (shadowSort === "created") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (shadowSort === "latency") return Number(b.delta_latency_ms ?? Number.NEGATIVE_INFINITY) - Number(a.delta_latency_ms ?? Number.NEGATIVE_INFINITY);
      if (shadowSort === "token_in") return Number(b.delta_token_in ?? Number.NEGATIVE_INFINITY) - Number(a.delta_token_in ?? Number.NEGATIVE_INFINITY);
      if (shadowSort === "token_out") return Number(b.delta_token_out ?? Number.NEGATIVE_INFINITY) - Number(a.delta_token_out ?? Number.NEGATIVE_INFINITY);
      return Math.abs(Number(b.delta_latency_ms ?? 0)) - Math.abs(Number(a.delta_latency_ms ?? 0));
    });
    return arr;
  }, [selectedAgentName, shadowCompare, shadowPairStatusFilter, shadowSort]);

  return {
    storySlug,
    loading,
    error,
    metrics,
    runs,
    prompts,
    experiments,
    feedbacks,
    memories,
    tuningEvents,
    coverageItems,
    coverageSummary,
    alerts,
    promptImpact,
    shadowCompare,
    errorTaxonomy,
    shadowPairStatusFilter,
    setShadowPairStatusFilter,
    shadowSort,
    setShadowSort,
    activeTab,
    setActiveTab,
    feedbackAgent,
    setFeedbackAgent,
    feedbackType,
    setFeedbackType,
    feedbackText,
    setFeedbackText,
    retrieveEmbedding,
    setRetrieveEmbedding,
    diffLeft,
    setDiffLeft,
    diffRight,
    setDiffRight,
    diffChunks,
    agentNameFilter,
    setAgentNameFilter,
    runDetail,
    runDetailLoading,
    focusRunId,
    focusPromptVersionId,
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    profileSlots,
    profileEvents,
    selectedAgentName,
    setSelectedAgentName,
    drawerTab,
    setDrawerTab,
    drawerLoading,
    drawerData,
    drawerVisualForm,
    setDrawerVisualForm,
    savingVisual,
    actionModal,
    actionReason,
    setActionReason,
    rollbackTargetVersion,
    setRollbackTargetVersion,
    promoteAuthor,
    setPromoteAuthor,
    promoteApprovedBy,
    setPromoteApprovedBy,
    promoteReasonTemplate,
    setPromoteReasonTemplate,
    promoteLookbackHours,
    setPromoteLookbackHours,
    promoteMinSamples,
    setPromoteMinSamples,
    actionBusy,
    levelUpPulse,
    loadAll,
    openPromoteActiveModal,
    onPromoteCanary,
    openArchiveModal,
    openRollbackModal,
    closeActionModal,
    submitActionModal,
    onPauseExperiment,
    onRollbackExperiment,
    onViewSnapshot,
    onViewRunDetail,
    onRunDiff,
    onCreateFeedback,
    onMuteFeedback,
    onRetrieveMemory,
    onSaveVisualProfile,
    selectedAgentAlerts,
    quickRollbackCandidate,
    drawerXpProgress,
    shadowCompareView,
  };
}

export type AgentGovernancePanelModel = ReturnType<typeof useAgentGovernancePanel>;
