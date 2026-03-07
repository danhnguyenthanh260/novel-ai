"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, max-lines, max-lines-per-function, complexity */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type AgentMetric = {
  agent_name: string;
  total_runs: number;
  done_runs: number;
  failed_runs: number;
  timeout_runs: number;
  success_rate: number;
  failure_rate: number;
  timeout_rate: number;
  avg_latency_ms: number | null;
  meta_leak_rate: number;
};

type AgentRun = {
  id: number;
  agent_name: string;
  chapter_id: string | null;
  status: string;
  error_code: string | null;
  prompt_version_id: number | null;
  context_snapshot_id: number | null;
  latency_ms: number | null;
  created_at: string;
  quality_json?: Record<string, unknown>;
};

type AgentPrompt = {
  version_id: number;
  profile_id: number;
  agent_name: string;
  scope: string;
  chapter_id: string | null;
  version_no: number;
  status: string;
  created_by: string;
  created_at: string;
  change_note: string | null;
  system_prompt: string;
};

type AgentExperiment = {
  id: number;
  agent_name: string;
  scope: string;
  chapter_id: string | null;
  baseline_version_id: number;
  candidate_version_id: number;
  traffic_percent: number;
  status: string;
  start_at: string;
  end_at: string | null;
};

type PromptDiffChunk = {
  added: boolean;
  removed: boolean;
  value: string;
  count: number;
};

type AgentFeedback = {
  id: number;
  agent_name: string;
  chapter_id: string | null;
  feedback_source: string;
  feedback_type: string;
  feedback_text: string;
  weight: string;
  status: string;
  created_at: string;
};

type AgentMemory = {
  id: number;
  agent_name: string;
  chapter_id: string | null;
  memory_type: string;
  memory_text: string;
  score: string;
  similarity?: number;
  created_at: string;
};

type AgentRunDetail = {
  id: number;
  job_id: number | null;
  task_id: number | null;
  story_id: number;
  chapter_id: string | null;
  agent_name: string;
  prompt_version_id: number | null;
  model_name: string | null;
  input_hash: string;
  output_hash: string | null;
  latency_ms: number | null;
  token_in: number | null;
  token_out: number | null;
  status: string;
  error_code: string | null;
  quality_json: unknown;
  context_snapshot_id: number | null;
  rationale_summary: string | null;
  created_at: string;
};

type AgentProfile = {
  id: number;
  species_name: string;
  nick_name: string;
  base_dna_id: number | null;
  experience_pts: number;
  level: number;
  is_sealed: boolean;
  active_slot_count: number;
  created_at: string;
  updated_at: string;
};

type AgentProfileSlot = {
  id: number;
  slot_type: string;
  artifact_ref_type: string;
  artifact_id: string;
  is_active: boolean;
  stats_mod: Record<string, unknown>;
  updated_at: string;
};

type AgentProfileEvent = {
  id: number;
  action: string;
  actor: string;
  details_json: Record<string, unknown>;
  created_at: string;
};

type DrawerEvent = {
  event_type: "RUN" | "TUNING" | "GROWTH";
  id: number;
  status: string;
  message: string;
  created_at: string;
  meta: Record<string, unknown>;
};

type AgentDrawerData = {
  agent_name: string;
  identity: {
    profile_id: number | null;
    species_name: string;
    nick_name: string;
    level: number;
    experience_pts: number;
    is_sealed: boolean;
  };
  runtime_summary: {
    state: "IDLE" | "RUNNING" | "DEGRADED" | "BLOCKED";
    lookback_hours: number;
    recent_total_runs: number;
    recent_failed_runs: number;
    success_rate: number;
    avg_latency_ms: number | null;
    latest_run: {
      id: number;
      status: string;
      error_code: string | null;
      prompt_version_id: number | null;
      model_name: string | null;
      latency_ms: number | null;
      created_at: string;
    } | null;
  };
  ops_meta?: {
    strategy_selected: string | null;
    learning_mode: string | null;
    learning_applied: boolean;
    learning_lr: Record<string, unknown>;
    profile_decay_factor: number | null;
    profile_reset_scope: string | null;
    profile_reset_applied: Record<string, unknown>;
    truth_resolution: Record<string, unknown>;
    truth_conflicts: Array<{
      id: number;
      conflict_id: string;
      losing_rule_ref: string;
      winning_rule_ref: string;
      resolution_mode: string;
      resolution_reason: string;
      payload_json?: Record<string, unknown>;
      created_at: string;
    }>;
    shadow_pairs?: Array<{
      id: number;
      pair_status: string;
      active_run_trace_id: number | null;
      shadow_run_trace_id: number | null;
      active_prompt_version_id: number | null;
      shadow_prompt_version_id: number | null;
      compare_json?: Record<string, unknown>;
      created_at: string;
    }>;
    shadow_compare?: Array<{
      pair_id: number;
      pair_status: string;
      active_run_trace_id: number | null;
      shadow_run_trace_id: number | null;
      active_prompt_version_id: number | null;
      shadow_prompt_version_id: number | null;
      delta_latency_ms: number | null;
      delta_token_in: number | null;
      delta_token_out: number | null;
      active_hard_fail: boolean | null;
      shadow_hard_fail: boolean | null;
      active_flagged_pct: number | null;
      shadow_flagged_pct: number | null;
      compare_json?: Record<string, unknown>;
      created_at: string;
    }>;
  };
  prompt_summary: {
    active: {
      version_id: number;
      status: string;
      version_no: number;
      created_at: string;
      change_note: string | null;
      system_prompt: string;
      developer_prompt: string | null;
    } | null;
    canary: {
      version_id: number;
      status: string;
      version_no: number;
      created_at: string;
      change_note: string | null;
      system_prompt: string;
      developer_prompt: string | null;
    } | null;
    recent?: Array<{
      version_id: number;
      status: string;
      version_no: number;
      created_at: string;
      change_note: string | null;
      system_prompt: string;
      developer_prompt: string | null;
    }>;
    hydration_latest?: {
      id: number;
      run_trace_id: number | null;
      task_type: string;
      prompt_version_id: number | null;
      hydration_output_hash: string | null;
      hydration_output_text: string | null;
      hydration_render_steps_json: Record<string, unknown>;
      llm_request_meta_json: Record<string, unknown>;
      tokens_prompt_base: number | null;
      tokens_rules_injected: number | null;
      tokens_memory_injected: number | null;
      tokens_feedback_injected: number | null;
      tokens_truncated: number | null;
      created_at: string;
    } | null;
    hydration_recent?: Array<{
      id: number;
      run_trace_id: number | null;
      task_type: string;
      prompt_version_id: number | null;
      hydration_output_hash: string | null;
      hydration_output_text: string | null;
      hydration_render_steps_json: Record<string, unknown>;
      llm_request_meta_json: Record<string, unknown>;
      tokens_prompt_base: number | null;
      tokens_rules_injected: number | null;
      tokens_memory_injected: number | null;
      tokens_feedback_injected: number | null;
      tokens_truncated: number | null;
      created_at: string;
    }>;
  };
  memory_summary: {
    items: Array<{ id: number; memory_type: string; memory_text: string; score: string; created_at: string }>;
  };
  feedback_summary: {
    items: Array<{ id: number; feedback_type: string; feedback_source: string; feedback_text: string; status: string; created_at: string }>;
  };
  config_snapshot: {
    model_name: string | null;
    prompt_version_id: number | null;
    timeout_seconds: number | null;
    retry_budget: number | null;
  };
  activity_events: DrawerEvent[];
  visual_profile: {
    skin: string;
    frame: string;
    badge: string;
    title: string;
    fx_level: string;
  };
};

type AgentTuningEvent = {
  id: number;
  agent_name: string;
  from_version_id: number | null;
  to_version_id: number;
  action: string;
  reason: string;
  author: string;
  approved_by: string | null;
  created_at: string;
};

type AgentCoverage = {
  agent_name: string;
  expected_count: number;
  traced_count: number;
  coverage_rate: number;
  below_threshold: boolean;
};

type AgentControlTab = "overview" | "runs" | "prompts" | "experiments" | "feedback" | "memory";
type AgentDrawerTab = "overview" | "prompt" | "memory" | "feedback" | "config";
type AgentAlert = {
  alert_type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  agent_name: string | null;
  metric_name: string;
  metric_value: number;
  threshold: number;
  message: string;
};
type AgentPromptImpact = {
  agent_name: string;
  prompt_version_id: number | null;
  total_runs: number;
  success_rate: number;
  failure_rate: number;
  meta_leak_rate: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
};

type AgentShadowCompare = {
  id: number;
  task_id: number | null;
  agent_name: string;
  pair_status: string;
  active_run_trace_id: number | null;
  shadow_run_trace_id: number | null;
  active_prompt_version_id: number | null;
  shadow_prompt_version_id: number | null;
  active_status: string | null;
  shadow_status: string | null;
  delta_latency_ms: number | null;
  delta_token_in: number | null;
  delta_token_out: number | null;
  active_hard_fail: boolean | null;
  shadow_hard_fail: boolean | null;
  active_flagged_pct: number | null;
  shadow_flagged_pct: number | null;
  compare_json?: Record<string, unknown>;
  created_at: string;
};

const PROMOTION_REASON_TEMPLATES = [
  "CANARY_SUCCESS",
  "QUALITY_FIX",
  "INCIDENT_MITIGATION",
  "MANUAL_OVERRIDE",
] as const;
type AgentErrorTaxonomy = {
  taxonomy: "META_LEAK" | "EMPTY_OUTPUT" | "ENTITY_DRIFT" | "BUDGET_MISS";
  hit_count: number;
  hit_rate: number;
  top_agents: Array<{ agent_name: string; hit_count: number }>;
};
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatDrawerEventMessage(ev: DrawerEvent): string {
  if (ev.event_type === "RUN") {
    const runId = typeof ev.meta?.run_id === "number" ? `Run #${ev.meta.run_id}` : "Run";
    const status = String(ev.status || "").toUpperCase() || "UNKNOWN";
    if (status === "DONE") {
      if (typeof ev.meta?.xp_delta === "number" && ev.meta.xp_delta > 0) {
        return `${runId}: completed (+${ev.meta.xp_delta} XP)`;
      }
      return `${runId}: completed successfully`;
    }
    if (status === "FAILED") return `${runId}: failed`;
    if (status === "TIMEOUT") return `${runId}: timed out`;
    if (status === "RUNNING") return `${runId}: is processing`;
    return `${runId}: ${status.toLowerCase()}`;
  }
  if (ev.event_type === "TUNING") {
    const action = String(ev.status || "").toUpperCase();
    if (action === "PROMOTE_ACTIVE") return "Prompt promoted to ACTIVE";
    if (action === "PROMOTE_CANARY") return "Prompt promoted to CANARY";
    if (action === "ROLLBACK_PROMPT") return "Prompt rollback executed";
  }
  if (ev.event_type === "GROWTH") {
    const action = String(ev.status || "").toUpperCase();
    if (action === "XP_RECALC") {
      const xp = Number(ev.meta?.experience_pts ?? 0);
      const level = Number(ev.meta?.level ?? 0);
      if (xp > 0 && level > 0) return `XP recalculated: ${xp} XP (Level ${level})`;
      return "XP recalculated";
    }
    if (action === "SEAL") return "Profile sealed";
    if (action === "UNSEAL") return "Profile unsealed";
  }
  return ev.message;
}

function avatarStateTone(state: "IDLE" | "RUNNING" | "DEGRADED" | "BLOCKED"): string {
  if (state === "RUNNING") return "agent-avatar--running";
  if (state === "DEGRADED") return "agent-avatar--degraded";
  if (state === "BLOCKED") return "agent-avatar--blocked";
  return "agent-avatar--idle";
}

function avatarFxClass(fxLevel: string): string {
  const val = (fxLevel || "").trim().toLowerCase();
  if (val === "off" || val === "none") return "agent-avatar--fx-none";
  if (val === "high") return "agent-avatar--fx-high";
  return "agent-avatar--fx-low";
}

function readChunkPromptTrace(hydrationLatest: AgentDrawerData["prompt_summary"]["hydration_latest"]): Array<Record<string, unknown>> {
  const render = hydrationLatest?.hydration_render_steps_json;
  if (!render || typeof render !== "object" || Array.isArray(render)) return [];
  const chunks = (render as Record<string, unknown>).chunk_prompt_trace;
  if (!Array.isArray(chunks)) return [];
  return chunks.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x));
}

async function readJson(res: Response): Promise<any> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP_${res.status}`);
  return j;
}

export default function AgentGovernancePanel({ storySlug }: { storySlug: string }) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [experiments, setExperiments] = useState<AgentExperiment[]>([]);
  const [feedbacks, setFeedbacks] = useState<AgentFeedback[]>([]);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [tuningEvents, setTuningEvents] = useState<AgentTuningEvent[]>([]);
  const [coverageItems, setCoverageItems] = useState<AgentCoverage[]>([]);
  const [coverageSummary, setCoverageSummary] = useState<{ overall_coverage: number; alert_count: number } | null>(null);
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [promptImpact, setPromptImpact] = useState<AgentPromptImpact[]>([]);
  const [shadowCompare, setShadowCompare] = useState<AgentShadowCompare[]>([]);
  const [errorTaxonomy, setErrorTaxonomy] = useState<AgentErrorTaxonomy[]>([]);
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
  const [agentNameFilter, setAgentNameFilter] = useState("");
  const [runDetail, setRunDetail] = useState<AgentRunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [focusRunId, setFocusRunId] = useState<number | null>(null);
  const [focusPromptVersionId, setFocusPromptVersionId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profileSlots, setProfileSlots] = useState<AgentProfileSlot[]>([]);
  const [profileEvents, setProfileEvents] = useState<AgentProfileEvent[]>([]);
  const [selectedAgentName, setSelectedAgentName] = useState("");
  const [drawerTab, setDrawerTab] = useState<AgentDrawerTab>("overview");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<AgentDrawerData | null>(null);
  const [drawerVisualForm, setDrawerVisualForm] = useState({
    skin: "mint_core",
    frame: "bronze_ring",
    badge: "split_master",
    title: "",
    fx_level: "low",
  });
  const [savingVisual, setSavingVisual] = useState(false);
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
  const [levelUpPulse, setLevelUpPulse] = useState(false);
  const lastSeenLevelRef = useRef<number | null>(null);

  const base = useMemo(() => `/api/stories/${encodeURIComponent(storySlug)}/agents`, [storySlug]);
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, r, p, e, f, mm, te, ch, al, pi, sc, tx, pr] = await Promise.all([
        fetch(`${base}/metrics`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/runs?limit=100${agentNameFilter ? `&agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/prompts${agentNameFilter ? `?agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/experiments`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/feedback?limit=60${agentNameFilter ? `&agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/memory?limit=60${agentNameFilter ? `&agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/tuning-events?limit=100${agentNameFilter ? `&agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/coverage-health?threshold=0.99`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/alerts`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/prompt-impact`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/shadow-compare?limit=120${agentNameFilter ? `&agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/error-taxonomy`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/profiles${agentNameFilter ? `?species_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
      ]);
      setMetrics(Array.isArray(m?.items) ? m.items : []);
      setRuns(Array.isArray(r?.items) ? r.items : []);
      setPrompts(Array.isArray(p?.items) ? p.items : []);
      setExperiments(Array.isArray(e?.items) ? e.items : []);
      setFeedbacks(Array.isArray(f?.items) ? f.items : []);
      setMemories(Array.isArray(mm?.items) ? mm.items : []);
      setTuningEvents(Array.isArray(te?.items) ? te.items : []);
      setCoverageItems(Array.isArray(ch?.items) ? ch.items : []);
      setCoverageSummary(ch?.summary ?? null);
      setAlerts(Array.isArray(al?.items) ? al.items : []);
      setPromptImpact(Array.isArray(pi?.items) ? pi.items : []);
      setShadowCompare(Array.isArray(sc?.items) ? sc.items : []);
      setErrorTaxonomy(Array.isArray(tx?.items) ? tx.items : []);
      const profileItems = Array.isArray(pr?.items) ? (pr.items as AgentProfile[]) : [];
      setProfiles(profileItems);
      if (!selectedProfileId && profileItems.length > 0) {
        setSelectedProfileId(Number(profileItems[0].id));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "LOAD_AGENT_CENTER_FAILED");
    } finally {
      setLoading(false);
    }
  }, [base, agentNameFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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

  useEffect(() => {
    if (!selectedProfileId) {
      setProfileSlots([]);
      setProfileEvents([]);
      return;
    }
    let dead = false;
    const run = async () => {
      try {
        const [slotsRes, eventsRes] = await Promise.all([
          fetch(`${base}/profiles/${selectedProfileId}/slots?active_only=1`, { cache: "no-store" }).then(readJson),
          fetch(`${base}/profiles/${selectedProfileId}/events?limit=20`, { cache: "no-store" }).then(readJson),
        ]);
        if (dead) return;
        setProfileSlots(Array.isArray(slotsRes?.items) ? slotsRes.items : []);
        setProfileEvents(Array.isArray(eventsRes?.items) ? eventsRes.items : []);
      } catch (err: unknown) {
        if (dead) return;
        setError(err instanceof Error ? err.message : "LOAD_PROFILE_EVOLUTION_FAILED");
      }
    };
    void run();
    return () => {
      dead = true;
    };
  }, [base, selectedProfileId]);

  useEffect(() => {
    if (!selectedAgentName.trim()) {
      setDrawerData(null);
      return;
    }
    let dead = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = async (showSpinner: boolean) => {
      try {
        if (showSpinner) setDrawerLoading(true);
        const [json, alertJson] = await Promise.all([
          fetch(`${base}/${encodeURIComponent(selectedAgentName)}/drawer`, { cache: "no-store" }).then(readJson),
          fetch(`${base}/alerts`, { cache: "no-store" }).then(readJson),
        ]);
        if (dead) return;
        setDrawerData((json as AgentDrawerData) ?? null);
        setAlerts(Array.isArray(alertJson?.items) ? alertJson.items : []);
      } catch (err: unknown) {
        if (dead) return;
        setError(err instanceof Error ? err.message : "LOAD_AGENT_DRAWER_FAILED");
        setDrawerData(null);
      } finally {
        if (!dead && showSpinner) setDrawerLoading(false);
      }
    };
    void run(true);
    timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void run(false);
    }, 12000);
    return () => {
      dead = true;
      if (timer) clearInterval(timer);
    };
  }, [base, selectedAgentName]);

  useEffect(() => {
    if (!drawerData?.visual_profile) return;
    setDrawerVisualForm({
      skin: drawerData.visual_profile.skin || "mint_core",
      frame: drawerData.visual_profile.frame || "bronze_ring",
      badge: drawerData.visual_profile.badge || "split_master",
      title: drawerData.visual_profile.title || "",
      fx_level: drawerData.visual_profile.fx_level || "low",
    });
  }, [drawerData]);

  useEffect(() => {
    const level = Number(drawerData?.identity?.level ?? 0);
    if (!level) return;
    const prev = lastSeenLevelRef.current;
    if (prev !== null && level > prev) {
      setLevelUpPulse(true);
      const t = setTimeout(() => setLevelUpPulse(false), 3500);
      lastSeenLevelRef.current = level;
      return () => clearTimeout(t);
    }
    lastSeenLevelRef.current = level;
    return undefined;
  }, [drawerData?.identity?.level]);

  const openPromoteActiveModal = useCallback((versionId: number) => {
    setActionModal({ mode: "promote_active", versionId });
    setActionReason("");
    setPromoteAuthor("studio");
    setPromoteApprovedBy("");
    setPromoteReasonTemplate("CANARY_SUCCESS");
    setPromoteLookbackHours(168);
    setPromoteMinSamples(20);
  }, []);

  const onPromoteCanary = useCallback(
    async (versionId: number) => {
      try {
        setError(null);
        await fetch(`${base}/prompts/${versionId}/promote-canary`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ traffic_percent: 10 }),
        }).then(readJson);
        await loadAll();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "PROMOTE_CANARY_FAILED");
      }
    },
    [base, loadAll]
  );

  const openArchiveModal = useCallback((versionId: number) => {
    setActionModal({ mode: "archive", versionId });
    setActionReason("");
    setRollbackTargetVersion("");
  }, []);

  const openRollbackModal = useCallback((versionId: number) => {
    setActionModal({ mode: "rollback", versionId });
    setActionReason("");
    setRollbackTargetVersion("");
  }, []);

  const closeActionModal = useCallback(() => {
    if (actionBusy) return;
    setActionModal(null);
    setActionReason("");
    setRollbackTargetVersion("");
    setPromoteApprovedBy("");
  }, [actionBusy]);

  const submitActionModal = useCallback(async () => {
    if (!actionModal) return;
    const reason = actionReason.trim();
    if (!reason) {
      setError("REASON_REQUIRED");
      return;
    }
    try {
      setActionBusy(true);
      setError(null);
      if (actionModal.mode === "archive") {
        await fetch(`${base}/prompts/${actionModal.versionId}/archive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        }).then(readJson);
      } else if (actionModal.mode === "rollback") {
        const toVersionId = Number(rollbackTargetVersion || 0);
        if (!toVersionId) {
          setError("ROLLBACK_TARGET_REQUIRED");
          return;
        }
        await fetch(`${base}/prompts/${actionModal.versionId}/rollback`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to_version_id: toVersionId, reason }),
        }).then(readJson);
      } else {
        const approvedBy = promoteApprovedBy.trim();
        if (!approvedBy) {
          setError("APPROVED_BY_REQUIRED");
          return;
        }
        const lookbackHours = Number(promoteLookbackHours || 0);
        const minCandidateSamples = Number(promoteMinSamples || 0);
        if (!lookbackHours || !minCandidateSamples) {
          setError("PROMOTION_POLICY_INPUT_INVALID");
          return;
        }
        await fetch(`${base}/prompts/${actionModal.versionId}/promote-active`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            author: promoteAuthor.trim() || "studio",
            approved_by: approvedBy,
            reason_template: promoteReasonTemplate,
            reason,
            lookback_hours: lookbackHours,
            min_candidate_samples: minCandidateSamples,
          }),
        }).then(readJson);
      }
      setActionModal(null);
      setActionReason("");
      setRollbackTargetVersion("");
      setPromoteApprovedBy("");
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PROMPT_ACTION_FAILED");
    } finally {
      setActionBusy(false);
    }
  }, [
    actionModal,
    actionReason,
    base,
    loadAll,
    promoteApprovedBy,
    promoteAuthor,
    promoteLookbackHours,
    promoteMinSamples,
    promoteReasonTemplate,
    rollbackTargetVersion,
  ]);

  const onPauseExperiment = useCallback(
    async (experimentId: number) => {
      try {
        setError(null);
        await fetch(`${base}/experiments/${experimentId}/pause`, { method: "POST" }).then(readJson);
        await loadAll();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "PAUSE_EXPERIMENT_FAILED");
      }
    },
    [base, loadAll]
  );

  const onRollbackExperiment = useCallback(
    async (experimentId: number) => {
      try {
        setError(null);
        await fetch(`${base}/experiments/${experimentId}/rollback`, { method: "POST" }).then(readJson);
        await loadAll();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "ROLLBACK_EXPERIMENT_FAILED");
      }
    },
    [base, loadAll]
  );

  const onViewSnapshot = useCallback(
    async (snapshotId: number | null) => {
      if (!snapshotId) return;
      try {
        const data = await fetch(`${base}/context-snapshots/${snapshotId}`, { cache: "no-store" }).then(readJson);
        const pretty = JSON.stringify(data?.item?.snapshot_json ?? {}, null, 2);
        alert(`Snapshot #${snapshotId}\n\n${pretty.slice(0, 6000)}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "GET_SNAPSHOT_FAILED");
      }
    },
    [base]
  );

  const onViewRunDetail = useCallback(
    async (runId: number) => {
      try {
        setRunDetailLoading(true);
        const data = await fetch(`${base}/runs/${runId}`, { cache: "no-store" }).then(readJson);
        setRunDetail((data?.item as AgentRunDetail) ?? null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "GET_RUN_DETAIL_FAILED");
      } finally {
        setRunDetailLoading(false);
      }
    },
    [base]
  );

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

  const onRunDiff = useCallback(async () => {
    if (!diffLeft || !diffRight) return;
    try {
      setError(null);
      const json = await fetch(
        `${base}/prompts/diff?left_version_id=${Number(diffLeft)}&right_version_id=${Number(diffRight)}`,
        { cache: "no-store" }
      ).then(readJson);
      setDiffChunks(Array.isArray(json?.chunks) ? json.chunks : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PROMPT_DIFF_FAILED");
    }
  }, [base, diffLeft, diffRight]);

  const onCreateFeedback = useCallback(async () => {
    if (!feedbackText.trim()) return;
    try {
      setError(null);
      await fetch(`${base}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_name: feedbackAgent,
          feedback_source: "HUMAN",
          feedback_type: feedbackType,
          feedback_text: feedbackText.trim(),
          weight: 1,
        }),
      }).then(readJson);
      setFeedbackText("");
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "CREATE_FEEDBACK_FAILED");
    }
  }, [base, feedbackAgent, feedbackText, feedbackType, loadAll]);

  const onMuteFeedback = useCallback(
    async (feedbackId: number) => {
      try {
        setError(null);
        await fetch(`${base}/feedback/${feedbackId}/mute`, { method: "POST" }).then(readJson);
        await loadAll();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "MUTE_FEEDBACK_FAILED");
      }
    },
    [base, loadAll]
  );

  const onRetrieveMemory = useCallback(async () => {
    try {
      const parsed = retrieveEmbedding
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x));
      if (parsed.length === 0) {
        setError("RETRIEVE_EMBEDDING_INVALID");
        return;
      }
      setError(null);
      const res = await fetch(`${base}/memory/retrieve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_name: feedbackAgent,
          context_embedding: parsed,
          top_k: 5,
          similarity_threshold: 0.2,
        }),
      }).then(readJson);
      setMemories(Array.isArray(res?.items) ? res.items : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "RETRIEVE_MEMORY_FAILED");
    }
  }, [base, feedbackAgent, retrieveEmbedding]);

  const onSaveVisualProfile = useCallback(async () => {
    if (!selectedAgentName.trim() || !drawerData?.identity?.profile_id) return;
    try {
      setSavingVisual(true);
      setError(null);
      await fetch(`${base}/${encodeURIComponent(selectedAgentName)}/visual-profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: drawerData.identity.profile_id,
          visual_profile: drawerVisualForm,
        }),
      }).then(readJson);
      const json = await fetch(`${base}/${encodeURIComponent(selectedAgentName)}/drawer`, { cache: "no-store" }).then(readJson);
      setDrawerData((json as AgentDrawerData) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "SAVE_VISUAL_PROFILE_FAILED");
    } finally {
      setSavingVisual(false);
    }
  }, [base, drawerData?.identity?.profile_id, drawerVisualForm, selectedAgentName]);

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

  return (
    <main className="space-y-4 p-2 md:p-4">
      <section className="surface-card flex items-center justify-between p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Control Center</h1>
          <div className="muted text-sm">story: {storySlug}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="shell-control px-2 py-1 text-sm"
            placeholder="Filter agent name..."
            value={agentNameFilter}
            onChange={(e) => setAgentNameFilter(e.target.value)}
          />
          <button className="shell-link px-3 py-2 text-sm" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest`} className="shell-link px-3 py-2 text-sm">
            Back To Ingest
          </Link>
        </div>
      </section>

      {error ? <div className="text-sm text-[#ff8f8f]">{error}</div> : null}

      <section className="surface-card p-2">
        <div className="flex flex-wrap gap-2">
          {([
            ["overview", "Overview"],
            ["runs", "Run Logs"],
            ["prompts", "Prompt Registry"],
            ["experiments", "Experiments"],
            ["feedback", "Feedback Loop"],
            ["memory", "Memory Bank"],
          ] as Array<[AgentControlTab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`shell-link px-3 py-1.5 text-xs ${activeTab === id ? "border-[#9de5dc]/40 text-[#9de5dc]" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "overview" && coverageSummary && coverageSummary.alert_count > 0 ? (
        <section className="surface-card border border-[#ff8f8f]/40 bg-[#3a1015] p-3">
          <div className="text-sm font-semibold text-[#ffb3b3]">
            Trace coverage alert: {(coverageSummary.overall_coverage * 100).toFixed(1)}% (target {"\u003e="} 99.0%)
          </div>
          <div className="mt-1 text-xs text-[#ffd2d2]">
            {coverageSummary.alert_count} agent(s) are below threshold. Check Coverage Health table and worker traces.
          </div>
        </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-slate-200">Agent Visual Stage</div>
          <div className="flex items-center gap-2">
            <select
              className="shell-control px-2 py-1 text-sm"
              value={selectedAgentName}
              onChange={(e) => setSelectedAgentName(e.target.value)}
            >
              <option value="">Select agent</option>
              {Array.from(new Set([
                ...metrics.map((x) => x.agent_name),
                ...runs.map((x) => x.agent_name),
                ...prompts.map((x) => x.agent_name),
                ...profiles.map((x) => x.species_name),
              ]))
                .filter(Boolean)
                .sort()
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="shell-link px-2 py-1 text-xs"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.25fr]">
          <div className="surface-card p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Center Stage</div>
            {drawerLoading ? (
              <div className="muted text-xs">Loading avatar state...</div>
            ) : drawerData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`agent-stage ${levelUpPulse ? "agent-stage--levelup" : ""}`}>
                    <div className={`agent-avatar ${avatarStateTone(drawerData.runtime_summary.state)} ${avatarFxClass(drawerData.visual_profile.fx_level)}`}>
                      <div className="agent-avatar__aura" />
                      <div className="agent-avatar__body">
                        <div className="agent-avatar__head">
                          <span className="agent-avatar__eye agent-avatar__eye--left" />
                          <span className="agent-avatar__eye agent-avatar__eye--right" />
                        </div>
                        <div className="agent-avatar__torso" />
                      </div>
                      <div className="agent-avatar__nameplate">
                        {drawerData.visual_profile.title || drawerData.identity.nick_name || drawerData.agent_name}
                      </div>
                      <div className="agent-avatar__badge">{drawerData.visual_profile.badge || "core"}</div>
                    </div>
                    <div className="agent-avatar__state">{drawerData.runtime_summary.state}</div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="text-sm font-medium text-slate-100">
                      {drawerData.visual_profile.title || drawerData.identity.nick_name || drawerData.agent_name}
                    </div>
                    <div className="muted">{drawerData.agent_name}</div>
                    <div className="muted">Level {drawerData.identity.level} | {drawerData.identity.is_sealed ? "Sealed" : "Unsealed"}</div>
                    <div className="muted">XP {drawerXpProgress.xp.toLocaleString()} | Next +{drawerXpProgress.toNext.toLocaleString()}</div>
                    <div className="h-1.5 w-48 overflow-hidden rounded bg-[#1f2937]">
                      <div className="h-full bg-[#9de5dc]" style={{ width: `${drawerXpProgress.pct}%` }} />
                    </div>
                    <div className="text-slate-300">
                      Success {pct(drawerData.runtime_summary.success_rate)} | Fail {drawerData.runtime_summary.recent_failed_runs}/{drawerData.runtime_summary.recent_total_runs}
                    </div>
                    {selectedAgentAlerts.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedAgentAlerts.slice(0, 3).map((a, idx) => (
                          <span
                            key={`${a.alert_type}-${idx}`}
                            className={`rounded px-2 py-[2px] text-[10px] uppercase tracking-wide ${
                              a.severity === "CRITICAL"
                                ? "border border-[#ff8f8f]/40 bg-[#441016] text-[#ffb3b3]"
                                : a.severity === "WARN"
                                  ? "border border-[#f8c97d]/40 bg-[#3f2a0b] text-[#ffd58f]"
                                  : "border border-[#6ec9ff]/40 bg-[#10293f] text-[#9fd8ff]"
                            }`}
                            title={a.message}
                          >
                            {a.alert_type.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="muted">Skin</span>
                    <input
                      className="shell-control w-full px-2 py-1"
                      value={drawerVisualForm.skin}
                      onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, skin: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="muted">Frame</span>
                    <input
                      className="shell-control w-full px-2 py-1"
                      value={drawerVisualForm.frame}
                      onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, frame: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="muted">Badge</span>
                    <input
                      className="shell-control w-full px-2 py-1"
                      value={drawerVisualForm.badge}
                      onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, badge: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="muted">FX Level</span>
                    <input
                      className="shell-control w-full px-2 py-1"
                      value={drawerVisualForm.fx_level}
                      onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, fx_level: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-xs">
                  <span className="muted">Title</span>
                  <input
                    className="shell-control w-full px-2 py-1"
                    value={drawerVisualForm.title}
                    onChange={(e) => setDrawerVisualForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </label>
                <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onSaveVisualProfile()} disabled={savingVisual}>
                  {savingVisual ? "Saving..." : "Save Decoration"}
                </button>
              </div>
            ) : (
              <div className="muted text-xs">Select an agent to open visual stage.</div>
            )}
          </div>

          <div className="surface-card p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Agent Detail Drawer</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {([
                ["overview", "Overview"],
                ["prompt", "Prompt"],
                ["memory", "Memory"],
                ["feedback", "Feedback"],
                ["config", "Config"],
              ] as Array<[AgentDrawerTab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`shell-link px-2 py-1 text-xs ${drawerTab === id ? "border-[#9de5dc]/40 text-[#9de5dc]" : ""}`}
                  onClick={() => setDrawerTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!drawerData ? (
              <div className="muted text-xs">No drawer data.</div>
            ) : (
              <div className="text-xs">
                {drawerTab === "overview" ? (
                  <div className="space-y-2">
                    <div>Prompt active: <span className="text-slate-200">{drawerData.prompt_summary.active?.version_id ?? "-"}</span></div>
                    <div>Prompt canary: <span className="text-slate-200">{drawerData.prompt_summary.canary?.version_id ?? "-"}</span></div>
                    <div>Model: <span className="text-slate-200">{drawerData.config_snapshot.model_name ?? "-"}</span></div>
                    <div>Latest run: <span className="text-slate-200">{drawerData.runtime_summary.latest_run ? `#${drawerData.runtime_summary.latest_run.id}` : "-"}</span></div>
                    {drawerData.ops_meta ? (
                      <div className="rounded border border-[#2A3441] bg-slate-900/40 p-2 text-[11px]">
                        <div>Strategy: <span className="text-slate-200">{drawerData.ops_meta.strategy_selected ?? "-"}</span></div>
                        <div>Learning mode: <span className="text-slate-200">{drawerData.ops_meta.learning_mode ?? "-"}</span></div>
                        <div>Learning applied: <span className="text-slate-200">{String(Boolean(drawerData.ops_meta.learning_applied))}</span></div>
                        <div>Decay: <span className="text-slate-200">{drawerData.ops_meta.profile_decay_factor ?? "-"}</span></div>
                        <div>Reset scope: <span className="text-slate-200">{drawerData.ops_meta.profile_reset_scope ?? "-"}</span></div>
                        <div>Truth conflicts: <span className="text-slate-200">{drawerData.ops_meta.truth_conflicts?.length ?? 0}</span></div>
                        <div>Shadow pairs: <span className="text-slate-200">{drawerData.ops_meta.shadow_pairs?.length ?? 0}</span></div>
                        {(drawerData.ops_meta.shadow_compare?.length ?? 0) > 0 ? (
                          <div className="mt-1 max-h-28 overflow-auto rounded border border-[#2A3441] p-1 text-[11px]">
                            {drawerData.ops_meta.shadow_compare?.slice(0, 3).map((s) => (
                              <div key={s.pair_id} className="mb-1 border-b border-[#2A3441] pb-1 last:mb-0 last:border-b-0 last:pb-0">
                                <div className="text-slate-200">pair #{s.pair_id} ({s.pair_status})</div>
                                <div className="text-slate-400">
                                  latency delta: {s.delta_latency_ms ?? "-"} ms | token in: {s.delta_token_in ?? "-"} | token out: {s.delta_token_out ?? "-"}
                                </div>
                                {s.compare_json && typeof s.compare_json === "object" ? (
                                  <div className="text-slate-400">
                                    no-write: {String((s.compare_json as Record<string, unknown>).no_write_invariant_ok ?? "-")}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {drawerTab === "prompt" ? (
                  <div className="space-y-2">
                    <div>Active version: <span className="text-slate-200">{drawerData.prompt_summary.active?.version_id ?? "-"}</span></div>
                    <div>Canary version: <span className="text-slate-200">{drawerData.prompt_summary.canary?.version_id ?? "-"}</span></div>
                    {drawerData.prompt_summary.hydration_latest ? (
                      <div className="rounded border border-cyan-300/20 bg-cyan-900/10 p-2">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-cyan-200">Hydrated Prompt (Latest Run)</div>
                        <div className="grid gap-1 text-[11px] text-slate-300">
                          <div>Run trace: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.run_trace_id ?? "-"}</span></div>
                          <div>Task type: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.task_type || "-"}</span></div>
                          <div>Prompt version: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.prompt_version_id ?? "-"}</span></div>
                          <div>Hash: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.hydration_output_hash ?? "-"}</span></div>
                          <div>
                            Token est: base {drawerData.prompt_summary.hydration_latest.tokens_prompt_base ?? 0}
                            {" | "}rules {drawerData.prompt_summary.hydration_latest.tokens_rules_injected ?? 0}
                            {" | "}memory {drawerData.prompt_summary.hydration_latest.tokens_memory_injected ?? 0}
                            {" | "}feedback {drawerData.prompt_summary.hydration_latest.tokens_feedback_injected ?? 0}
                          </div>
                        </div>
                        {(() => {
                          const chunks = readChunkPromptTrace(drawerData.prompt_summary.hydration_latest);
                          if (chunks.length === 0) return null;
                          return (
                            <div className="mt-2 rounded border border-cyan-300/20 bg-slate-950/70 p-2">
                              <div className="mb-1 text-[11px] uppercase tracking-wide text-cyan-200">
                                Chunk Prompt Trace ({chunks.length})
                              </div>
                              <div className="max-h-44 space-y-1 overflow-auto text-[11px]">
                                {chunks.slice(0, 8).map((c, idx) => (
                                  <div key={idx} className="rounded border border-[#2A3441] bg-slate-900/50 p-1">
                                    <div className="text-slate-200">
                                      chunk #{String(c.chunk_index ?? idx)} @ {String(c.chunk_start ?? "-")} | chars {String(c.chunk_chars ?? "-")}
                                    </div>
                                    <div className="break-all text-slate-400">sys: {String(c.system_prompt_sha256 ?? "-")}</div>
                                    <div className="break-all text-slate-400">usr: {String(c.user_prompt_sha256 ?? "-")}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        {drawerData.prompt_summary.hydration_latest.hydration_output_text ? (
                          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded border border-cyan-300/20 bg-slate-950/70 p-2 text-[11px] leading-relaxed text-slate-200">
                            {drawerData.prompt_summary.hydration_latest.hydration_output_text}
                          </pre>
                        ) : (
                          <div className="mt-2 text-[11px] text-slate-400">Hydrated prompt text storage is disabled.</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400">No hydrated prompt trace yet for this agent.</div>
                    )}
                    {drawerData.prompt_summary.hydration_recent && drawerData.prompt_summary.hydration_recent.length > 0 ? (
                      <div className="rounded border border-[#2A3441] p-2">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Hydration History</div>
                        <div className="space-y-1">
                          {drawerData.prompt_summary.hydration_recent.slice(0, 6).map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-2 rounded border border-[#2A3441] bg-slate-900/40 px-2 py-1 text-[11px]">
                              <div className="min-w-0">
                                <div className="truncate text-slate-200">
                                  {h.task_type} | v{h.prompt_version_id ?? "-"} | #{h.run_trace_id ?? "-"}
                                </div>
                                <div className="truncate text-slate-400">{new Date(h.created_at).toLocaleString()}</div>
                              </div>
                              {typeof h.run_trace_id === "number" ? (
                                <Link
                                  href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=runs&run_id=${String(h.run_trace_id)}`}
                                  className="shell-link px-2 py-1 text-[11px]"
                                >
                                  Open
                                </Link>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {drawerData.prompt_summary.active ? (
                      <div className="rounded border border-[#2A3441] p-2">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Active System Prompt</div>
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200">
                          {drawerData.prompt_summary.active.system_prompt}
                        </pre>
                        {drawerData.prompt_summary.active.developer_prompt ? (
                          <>
                            <div className="mb-1 mt-2 text-[11px] uppercase tracking-wide text-slate-400">Active Developer Prompt</div>
                            <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                              {drawerData.prompt_summary.active.developer_prompt}
                            </pre>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {drawerData.prompt_summary.canary ? (
                      <div className="rounded border border-[#2A3441] p-2">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Canary System Prompt</div>
                        <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200">
                          {drawerData.prompt_summary.canary.system_prompt}
                        </pre>
                      </div>
                    ) : null}
                    <Link href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=prompts`} className="shell-link inline-block px-2 py-1 text-xs">
                      Open Prompt Registry
                    </Link>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {drawerData.prompt_summary.canary ? (
                        <button
                          type="button"
                          className="shell-link px-2 py-1 text-xs"
                          onClick={() => void onPromoteCanary(drawerData.prompt_summary.canary!.version_id)}
                        >
                          Promote Canary (10%)
                        </button>
                      ) : null}
                      {drawerData.prompt_summary.canary ? (
                        <button
                          type="button"
                          className="shell-link px-2 py-1 text-xs"
                          onClick={() => openPromoteActiveModal(drawerData.prompt_summary.canary!.version_id)}
                        >
                          Promote To Active
                        </button>
                      ) : null}
                      {drawerData.prompt_summary.active && quickRollbackCandidate ? (
                        <button
                          type="button"
                          className="shell-link px-2 py-1 text-xs"
                          onClick={() => {
                            openRollbackModal(drawerData.prompt_summary.active!.version_id);
                            setRollbackTargetVersion(quickRollbackCandidate.version_id);
                          }}
                        >
                          Quick Rollback
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {drawerTab === "memory" ? (
                  <div className="space-y-2">
                    {drawerData.memory_summary.items.length === 0 ? <div className="muted">No memory shards.</div> : null}
                    {drawerData.memory_summary.items.slice(0, 4).map((m) => (
                      <div key={m.id} className="rounded border border-[#2A3441] p-2">
                        <div className="text-slate-200">{m.memory_type} | score {m.score}</div>
                        <div className="muted line-clamp-2">{m.memory_text}</div>
                      </div>
                    ))}
                    <Link href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=memory`} className="shell-link inline-block px-2 py-1 text-xs">
                      Open Memory Bank
                    </Link>
                  </div>
                ) : null}
                {drawerTab === "feedback" ? (
                  <div className="space-y-2">
                    {drawerData.feedback_summary.items.length === 0 ? <div className="muted">No feedback items.</div> : null}
                    {drawerData.feedback_summary.items.slice(0, 4).map((f) => (
                      <div key={f.id} className="rounded border border-[#2A3441] p-2">
                        <div className="text-slate-200">{f.feedback_type} | {f.feedback_source}</div>
                        <div className="muted line-clamp-2">{f.feedback_text}</div>
                      </div>
                    ))}
                    <Link href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=feedback`} className="shell-link inline-block px-2 py-1 text-xs">
                      Open Feedback Loop
                    </Link>
                  </div>
                ) : null}
                {drawerTab === "config" ? (
                  <div className="space-y-2">
                    <div>Model: <span className="text-slate-200">{drawerData.config_snapshot.model_name ?? "-"}</span></div>
                    <div>Prompt version: <span className="text-slate-200">{drawerData.config_snapshot.prompt_version_id ?? "-"}</span></div>
                    <div>Timeout: <span className="text-slate-200">{drawerData.config_snapshot.timeout_seconds ?? "-"}</span></div>
                    <div>Retry budget: <span className="text-slate-200">{drawerData.config_snapshot.retry_budget ?? "-"}</span></div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 surface-card p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Activity Timeline</div>
          {!drawerData || drawerData.activity_events.length === 0 ? (
            <div className="muted text-xs">No recent activity.</div>
          ) : (
            <div className="space-y-2">
              {drawerData.activity_events.map((ev) => (
                <div key={`${ev.event_type}-${ev.id}`} className="flex items-start justify-between gap-2 rounded border border-[#2A3441] p-2 text-xs">
                  <div>
                    <div className="text-slate-200">{formatDrawerEventMessage(ev)}</div>
                    <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
                  </div>
                  {ev.event_type === "RUN" && typeof ev.meta?.run_id === "number" ? (
                    <Link
                      href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=runs&run_id=${String(ev.meta.run_id)}`}
                      className="shell-link px-2 py-1 text-[11px]"
                    >
                      Open Run
                    </Link>
                  ) : (
                    <span className="muted text-[11px]">{ev.event_type}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Agent Evolution Center</div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="surface-card p-2">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Character Stats</div>
            <div className="mb-2">
              <select
                className="shell-control w-full px-2 py-1 text-sm"
                value={selectedProfileId ?? ""}
                onChange={(e) => setSelectedProfileId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select profile</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nick_name} ({p.species_name})
                  </option>
                ))}
              </select>
            </div>
            {selectedProfileId ? (
              (() => {
                const p = profiles.find((x) => x.id === selectedProfileId);
                if (!p) return <div className="muted text-xs">Profile not found.</div>;
                const xpPct = Math.min(100, Math.max(0, ((p.experience_pts % 100000) / 100000) * 100));
                return (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium text-slate-100">{p.nick_name}</div>
                    <div className="muted text-xs">{p.species_name}</div>
                    <div className="text-xs">Level: {p.level} | XP: {p.experience_pts}</div>
                    <div className="h-2 overflow-hidden rounded bg-[#1f2937]">
                      <div className="h-full bg-[#9de5dc]" style={{ width: `${xpPct}%` }} />
                    </div>
                    <div className={`text-xs ${p.is_sealed ? "text-[#ffd58f]" : "text-slate-400"}`}>
                      {p.is_sealed ? "Sealed (DNA locked)" : "Unsealed"}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="muted text-xs">No profile selected.</div>
            )}
          </div>

          <div className="surface-card p-2">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Equipment Slots</div>
            <div className="space-y-2">
              {profileSlots.length === 0 ? (
                <div className="muted text-xs">No active slots.</div>
              ) : (
                profileSlots.map((s) => (
                  <div key={s.id} className="rounded border border-[#2A3441] p-2 text-xs">
                    <div className="font-medium text-slate-200">{s.slot_type}</div>
                    <div className="muted">{s.artifact_ref_type}</div>
                    <div className="font-mono text-[11px] text-slate-300">{s.artifact_id}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="surface-card p-2">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Evolution Log</div>
            <div className="space-y-2">
              {profileEvents.length === 0 ? (
                <div className="muted text-xs">No evolution events yet.</div>
              ) : (
                profileEvents.map((ev) => (
                  <div key={ev.id} className="rounded border border-[#2A3441] p-2 text-xs">
                    <div className="font-medium text-slate-200">{ev.action}</div>
                    <div className="muted">by {ev.actor}</div>
                    <div className="muted">{new Date(ev.created_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Error Taxonomy</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Category</th>
                <th className="px-2 py-1">Hits</th>
                <th className="px-2 py-1">Hit Rate</th>
                <th className="px-2 py-1">Top Agents</th>
              </tr>
            </thead>
            <tbody>
              {errorTaxonomy.map((x) => (
                <tr key={x.taxonomy} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">{x.taxonomy}</td>
                  <td className="px-2 py-2">{x.hit_count}</td>
                  <td className="px-2 py-2">{pct(x.hit_rate)}</td>
                  <td className="px-2 py-2">
                    {x.top_agents.length
                      ? x.top_agents.map((a) => `${a.agent_name} (${a.hit_count})`).join(", ")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Coverage Health</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Expected</th>
                <th className="px-2 py-1">Traced</th>
                <th className="px-2 py-1">Coverage</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {coverageItems.map((c) => (
                <tr key={c.agent_name} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">{c.agent_name}</td>
                  <td className="px-2 py-2">{c.expected_count}</td>
                  <td className="px-2 py-2">{c.traced_count}</td>
                  <td className="px-2 py-2">{(c.coverage_rate * 100).toFixed(1)}%</td>
                  <td className={`px-2 py-2 ${c.below_threshold ? "text-[#ff9f9f]" : "text-[#9de5dc]"}`}>
                    {c.below_threshold ? "ALERT" : "OK"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Alert Feed</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Severity</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Metric</th>
                <th className="px-2 py-1">Value</th>
                <th className="px-2 py-1">Threshold</th>
                <th className="px-2 py-1">Message</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, idx) => (
                <tr key={`${a.alert_type}-${a.agent_name || "all"}-${idx}`} className="border-t border-[#2A3441]">
                  <td className={`px-2 py-2 ${a.severity === "CRITICAL" ? "text-[#ff8f8f]" : a.severity === "WARN" ? "text-[#ffd58f]" : "text-slate-300"}`}>
                    {a.severity}
                  </td>
                  <td className="px-2 py-2">{a.alert_type}</td>
                  <td className="px-2 py-2">{a.agent_name || "-"}</td>
                  <td className="px-2 py-2">{a.metric_name}</td>
                  <td className="px-2 py-2">{a.metric_value}</td>
                  <td className="px-2 py-2">{a.threshold}</td>
                  <td className="px-2 py-2">{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-slate-200">Shadow Compare</div>
          <div className="flex items-center gap-2">
            <select
              className="shell-control px-2 py-1 text-xs"
              value={shadowPairStatusFilter}
              onChange={(e) => setShadowPairStatusFilter(e.target.value as "ALL" | "PLANNED" | "PAIRED" | "COMPARED" | "FAILED")}
            >
              <option value="ALL">All Status</option>
              <option value="PLANNED">PLANNED</option>
              <option value="PAIRED">PAIRED</option>
              <option value="COMPARED">COMPARED</option>
              <option value="FAILED">FAILED</option>
            </select>
            <select
              className="shell-control px-2 py-1 text-xs"
              value={shadowSort}
              onChange={(e) => setShadowSort(e.target.value as "latency_abs" | "latency" | "token_in" | "token_out" | "created")}
            >
              <option value="latency_abs">Sort: |Latency Delta|</option>
              <option value="latency">Sort: Latency Delta</option>
              <option value="token_in">Sort: Token In Delta</option>
              <option value="token_out">Sort: Token Out Delta</option>
              <option value="created">Sort: Latest</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Pair</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Active Run</th>
                <th className="px-2 py-1">Shadow Run</th>
                <th className="px-2 py-1">Prompt A/S</th>
                <th className="px-2 py-1">Latency Δ(ms)</th>
                <th className="px-2 py-1">Token In Δ</th>
                <th className="px-2 py-1">Token Out Δ</th>
                <th className="px-2 py-1">Hard Fail A/S</th>
                <th className="px-2 py-1">Flagged% A/S</th>
                <th className="px-2 py-1">Created</th>
              </tr>
            </thead>
            <tbody>
              {shadowCompareView.map((s) => (
                <tr key={s.id} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">#{s.id}</td>
                  <td className="px-2 py-2">{s.agent_name}</td>
                  <td className="px-2 py-2">{s.pair_status}</td>
                  <td className="px-2 py-2">{s.active_run_trace_id ?? "-"}</td>
                  <td className="px-2 py-2">{s.shadow_run_trace_id ?? "-"}</td>
                  <td className="px-2 py-2">{s.active_prompt_version_id ?? "-"} / {s.shadow_prompt_version_id ?? "-"}</td>
                  <td className="px-2 py-2">{s.delta_latency_ms ?? "-"}</td>
                  <td className="px-2 py-2">{s.delta_token_in ?? "-"}</td>
                  <td className="px-2 py-2">{s.delta_token_out ?? "-"}</td>
                  <td className="px-2 py-2">{String(s.active_hard_fail)} / {String(s.shadow_hard_fail)}</td>
                  <td className="px-2 py-2">{s.active_flagged_pct ?? "-"} / {s.shadow_flagged_pct ?? "-"}</td>
                  <td className="px-2 py-2">{new Date(s.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {shadowCompareView.length === 0 ? (
                <tr>
                  <td className="muted px-2 py-4 text-sm" colSpan={12}>
                    No shadow compare rows for current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Prompt Impact</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Prompt Version</th>
                <th className="px-2 py-1">Runs</th>
                <th className="px-2 py-1">Success</th>
                <th className="px-2 py-1">Failure</th>
                <th className="px-2 py-1">Meta Leak</th>
                <th className="px-2 py-1">Avg Latency</th>
                <th className="px-2 py-1">p95 Latency</th>
              </tr>
            </thead>
            <tbody>
              {promptImpact.map((p, idx) => (
                <tr key={`${p.agent_name}-${p.prompt_version_id ?? "null"}-${idx}`} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">{p.agent_name}</td>
                  <td className="px-2 py-2">{p.prompt_version_id ?? "-"}</td>
                  <td className="px-2 py-2">{p.total_runs}</td>
                  <td className="px-2 py-2">{pct(p.success_rate)}</td>
                  <td className="px-2 py-2">{pct(p.failure_rate)}</td>
                  <td className="px-2 py-2">{pct(p.meta_leak_rate)}</td>
                  <td className="px-2 py-2">{p.avg_latency_ms ?? "-"}</td>
                  <td className="px-2 py-2">{p.p95_latency_ms ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Metrics</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Total</th>
                <th className="px-2 py-1">Success</th>
                <th className="px-2 py-1">Fail</th>
                <th className="px-2 py-1">Timeout</th>
                <th className="px-2 py-1">Avg Latency</th>
                <th className="px-2 py-1">Meta Leak</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.agent_name} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">{m.agent_name}</td>
                  <td className="px-2 py-2">{m.total_runs}</td>
                  <td className="px-2 py-2">{pct(m.success_rate)}</td>
                  <td className="px-2 py-2">{pct(m.failure_rate)}</td>
                  <td className="px-2 py-2">{pct(m.timeout_rate)}</td>
                  <td className="px-2 py-2">{m.avg_latency_ms ?? "-"}</td>
                  <td className="px-2 py-2">{pct(m.meta_leak_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "experiments" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Experiments</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Scope</th>
                <th className="px-2 py-1">Baseline</th>
                <th className="px-2 py-1">Candidate</th>
                <th className="px-2 py-1">Traffic</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((x) => (
                <tr key={x.id} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2">{x.id}</td>
                  <td className="px-2 py-2">{x.agent_name}</td>
                  <td className="px-2 py-2">{x.scope}</td>
                  <td className="px-2 py-2">{x.baseline_version_id}</td>
                  <td className="px-2 py-2">{x.candidate_version_id}</td>
                  <td className="px-2 py-2">{x.traffic_percent}%</td>
                  <td className="px-2 py-2">{x.status}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onPauseExperiment(x.id)}>
                        Pause
                      </button>
                      <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onRollbackExperiment(x.id)}>
                        Rollback
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "prompts" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Prompts</div>
        <div className="mb-3 flex items-center gap-2">
          <select
            className="shell-control px-2 py-1 text-sm"
            value={diffLeft}
            onChange={(e) => setDiffLeft(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Left version</option>
            {prompts.map((p) => (
              <option key={`left-${p.version_id}`} value={p.version_id}>
                {p.version_id} | {p.agent_name} | v{p.version_no}
              </option>
            ))}
          </select>
          <select
            className="shell-control px-2 py-1 text-sm"
            value={diffRight}
            onChange={(e) => setDiffRight(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Right version</option>
            {prompts.map((p) => (
              <option key={`right-${p.version_id}`} value={p.version_id}>
                {p.version_id} | {p.agent_name} | v{p.version_no}
              </option>
            ))}
          </select>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onRunDiff()}>
            Compare
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Version ID</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Scope</th>
                <th className="px-2 py-1">Version</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Created</th>
                <th className="px-2 py-1">Note</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr
                  key={p.version_id}
                  className={`border-t border-[#2A3441] ${focusPromptVersionId === p.version_id ? "bg-[#16313a]" : ""}`}
                >
                  <td className="px-2 py-2 font-mono">{p.version_id}</td>
                  <td className="px-2 py-2">{p.agent_name}</td>
                  <td className="px-2 py-2">{p.scope}{p.chapter_id ? `:${p.chapter_id}` : ""}</td>
                  <td className="px-2 py-2">{p.version_no}</td>
                  <td className="px-2 py-2">{p.status}</td>
                  <td className="px-2 py-2">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="px-2 py-2">{p.change_note || "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={() => void onPromoteCanary(p.version_id)}
                      >
                        Canary 10%
                      </button>
                      <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={() => openPromoteActiveModal(p.version_id)}
                      >
                        Promote Active
                      </button>
                      <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={() => openArchiveModal(p.version_id)}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={() => openRollbackModal(p.version_id)}
                      >
                        Rollback
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {diffChunks.length > 0 && (
          <div className="mt-3 rounded border border-white/10 bg-black/20 p-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Prompt Diff</div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
              {diffChunks.map((c, i) => {
                const prefix = c.added ? "+ " : c.removed ? "- " : "  ";
                return (
                  <span
                    key={`diff-${i}`}
                    className={c.added ? "text-emerald-300" : c.removed ? "text-rose-300" : "text-slate-300"}
                  >
                    {prefix}
                    {c.value}
                  </span>
                );
              })}
            </pre>
          </div>
        )}
      </section>
      ) : null}

      {activeTab === "runs" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Recent Runs</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">Run ID</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Chapter</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Prompt Version</th>
                <th className="px-2 py-1">Context Snapshot</th>
                <th className="px-2 py-1">Latency</th>
                <th className="px-2 py-1">Error</th>
                <th className="px-2 py-1">Created</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={`border-t border-[#2A3441] ${focusRunId === r.id ? "bg-[#16313a]" : ""}`}>
                  <td className="px-2 py-2 font-mono">{r.id}</td>
                  <td className="px-2 py-2">{r.agent_name}</td>
                  <td className="px-2 py-2">{r.chapter_id || "-"}</td>
                  <td className="px-2 py-2">{r.status}</td>
                  <td className="px-2 py-2">{r.prompt_version_id ?? "-"}</td>
                  <td className="px-2 py-2">
                    {r.context_snapshot_id ? (
                      <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={() => void onViewSnapshot(r.context_snapshot_id)}
                      >
                        #{r.context_snapshot_id}
                      </button>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-2">{r.latency_ms ?? "-"}</td>
                  <td className="px-2 py-2 text-[#ff9f9f]">{r.error_code || "-"}</td>
                  <td className="px-2 py-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-2 py-2">
                    <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onViewRunDetail(r.id)}>
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Run Detail Panel</div>
          {runDetailLoading ? <div className="text-xs text-slate-400">Loading run detail...</div> : null}
          {!runDetailLoading && !runDetail ? <div className="text-xs text-slate-500">Select a run and click Detail.</div> : null}
          {!runDetailLoading && runDetail ? (
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
              {JSON.stringify(runDetail, null, 2)}
            </pre>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeTab === "overview" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Reason Audit (Tuning Events)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Action</th>
                <th className="px-2 py-1">From</th>
                <th className="px-2 py-1">To</th>
                <th className="px-2 py-1">Reason</th>
                <th className="px-2 py-1">Author</th>
                <th className="px-2 py-1">Approved By</th>
                <th className="px-2 py-1">Created</th>
              </tr>
            </thead>
            <tbody>
              {tuningEvents.map((ev) => (
                <tr key={ev.id} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2 font-mono">{ev.id}</td>
                  <td className="px-2 py-2">{ev.agent_name}</td>
                  <td className="px-2 py-2">{ev.action}</td>
                  <td className="px-2 py-2">{ev.from_version_id ?? "-"}</td>
                  <td className="px-2 py-2">{ev.to_version_id}</td>
                  <td className="px-2 py-2">{ev.reason}</td>
                  <td className="px-2 py-2">{ev.author}</td>
                  <td className="px-2 py-2">{ev.approved_by ?? "-"}</td>
                  <td className="px-2 py-2">{new Date(ev.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "feedback" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Feedback Loop</div>
        <div className="mb-3 flex items-center gap-2">
          <input
            className="shell-control px-2 py-1 text-sm"
            value={feedbackAgent}
            onChange={(e) => setFeedbackAgent(e.target.value)}
            placeholder="agent name"
          />
          <select className="shell-control px-2 py-1 text-sm" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
            <option value="FIX">FIX</option>
            <option value="KEEP">KEEP</option>
            <option value="AVOID">AVOID</option>
            <option value="RULE">RULE</option>
          </select>
          <input
            className="shell-control min-w-[420px] px-2 py-1 text-sm"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="feedback text..."
          />
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onCreateFeedback()}>
            Add Feedback
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Weight</th>
                <th className="px-2 py-1">Text</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {feedbacks.map((f) => (
                <tr key={f.id} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2 font-mono">{f.id}</td>
                  <td className="px-2 py-2">{f.agent_name}</td>
                  <td className="px-2 py-2">{f.feedback_type}</td>
                  <td className="px-2 py-2">{f.status}</td>
                  <td className="px-2 py-2">{f.weight}</td>
                  <td className="px-2 py-2">{f.feedback_text}</td>
                  <td className="px-2 py-2">
                    <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onMuteFeedback(f.id)}>
                      Mute
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === "memory" ? (
      <section className="surface-card p-3">
        <div className="mb-2 text-sm font-medium text-slate-200">Memory Bank</div>
        <div className="mb-3 flex items-center gap-2">
          <input
            className="shell-control min-w-[520px] px-2 py-1 text-sm"
            value={retrieveEmbedding}
            onChange={(e) => setRetrieveEmbedding(e.target.value)}
            placeholder="context embedding (comma-separated floats)"
          />
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => void onRetrieveMemory()}>
            Retrieve Top-K
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Agent</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Similarity</th>
                <th className="px-2 py-1">Text</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((m) => (
                <tr key={m.id} className="border-t border-[#2A3441]">
                  <td className="px-2 py-2 font-mono">{m.id}</td>
                  <td className="px-2 py-2">{m.agent_name}</td>
                  <td className="px-2 py-2">{m.memory_type}</td>
                  <td className="px-2 py-2">{m.score}</td>
                  <td className="px-2 py-2">{typeof m.similarity === "number" ? m.similarity.toFixed(3) : "-"}</td>
                  <td className="px-2 py-2">{m.memory_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {actionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded border border-white/15 bg-[#0f141b] p-4">
            <div className="mb-3 text-sm font-semibold text-slate-100">
              {actionModal.mode === "archive"
                ? "Archive Prompt Version"
                : actionModal.mode === "rollback"
                  ? "Rollback Prompt Version"
                  : "Promote Active (Approval Required)"}
            </div>
            <div className="mb-2 text-xs text-slate-400">version: {actionModal.versionId}</div>
            {actionModal.mode === "rollback" ? (
              <div className="mb-3">
                <label className="mb-1 block text-xs text-slate-300">Target Version ID</label>
                <input
                  type="number"
                  className="shell-control w-full px-2 py-1 text-sm"
                  value={rollbackTargetVersion}
                  onChange={(e) => setRollbackTargetVersion(e.target.value ? Number(e.target.value) : "")}
                  placeholder="e.g. 101"
                />
              </div>
            ) : null}
            {actionModal.mode === "promote_active" ? (
              <>
                <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Author</label>
                    <input
                      className="shell-control w-full px-2 py-1 text-sm"
                      value={promoteAuthor}
                      onChange={(e) => setPromoteAuthor(e.target.value)}
                      placeholder="studio"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Approved By</label>
                    <input
                      className="shell-control w-full px-2 py-1 text-sm"
                      value={promoteApprovedBy}
                      onChange={(e) => setPromoteApprovedBy(e.target.value)}
                      placeholder="reviewer id"
                    />
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Reason Template</label>
                    <select
                      className="shell-control w-full px-2 py-1 text-sm"
                      value={promoteReasonTemplate}
                      onChange={(e) => setPromoteReasonTemplate(e.target.value as (typeof PROMOTION_REASON_TEMPLATES)[number])}
                    >
                      {PROMOTION_REASON_TEMPLATES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Lookback Hours</label>
                    <input
                      type="number"
                      className="shell-control w-full px-2 py-1 text-sm"
                      value={promoteLookbackHours}
                      onChange={(e) => setPromoteLookbackHours(e.target.value ? Number(e.target.value) : "")}
                      min={1}
                      max={720}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Min Samples</label>
                    <input
                      type="number"
                      className="shell-control w-full px-2 py-1 text-sm"
                      value={promoteMinSamples}
                      onChange={(e) => setPromoteMinSamples(e.target.value ? Number(e.target.value) : "")}
                      min={1}
                      max={10000}
                    />
                  </div>
                </div>
              </>
            ) : null}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-slate-300">Reason (required)</label>
              <textarea
                className="shell-control min-h-[90px] w-full px-2 py-1 text-sm"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Explain why this archive/rollback is required..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="shell-link px-3 py-2 text-xs" onClick={closeActionModal} disabled={actionBusy}>
                Cancel
              </button>
              <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => void submitActionModal()} disabled={actionBusy}>
                {actionBusy ? "Submitting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

