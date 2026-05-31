import { useCallback, useEffect, useState } from "react";

import { readJson } from "../shared/agentGovernanceUtils";
import type {
  AgentAlert,
  AgentCoverage,
  AgentErrorTaxonomy,
  AgentExperiment,
  AgentFeedback,
  AgentMemory,
  AgentMetric,
  AgentProfile,
  AgentProfileEvent,
  AgentProfileSlot,
  AgentPrompt,
  AgentPromptImpact,
  AgentRun,
  AgentShadowCompare,
  AgentTuningEvent,
} from "../shared/types";

type Args = {
  base: string;
  agentNameFilter: string;
  setError: (value: string | null) => void;
};

export function useAgentGovernanceData({ base, agentNameFilter, setError }: Args) {
  const [loading, setLoading] = useState(false);
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
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profileSlots, setProfileSlots] = useState<AgentProfileSlot[]>([]);
  const [profileEvents, setProfileEvents] = useState<AgentProfileEvent[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const agentQuery = agentNameFilter ? `&agent_name=${encodeURIComponent(agentNameFilter)}` : "";
      const [m, r, p, e, f, mm, te, ch, al, pi, sc, tx, pr] = await Promise.all([
        fetch(`${base}/metrics`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/runs?limit=100${agentQuery}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/prompts${agentNameFilter ? `?agent_name=${encodeURIComponent(agentNameFilter)}` : ""}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/experiments`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/feedback?limit=60${agentQuery}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/memory?limit=60${agentQuery}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/tuning-events?limit=100${agentQuery}`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/coverage-health?threshold=0.99`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/alerts`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/prompt-impact`, { cache: "no-store" }).then(readJson),
        fetch(`${base}/shadow-compare?limit=120${agentQuery}`, { cache: "no-store" }).then(readJson),
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
      setSelectedProfileId((current) => current ?? (profileItems.length > 0 ? Number(profileItems[0].id) : null));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "LOAD_AGENT_CENTER_FAILED");
    } finally {
      setLoading(false);
    }
  }, [agentNameFilter, base, setError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
  }, [base, selectedProfileId, setError]);

  return {
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
  };
}
