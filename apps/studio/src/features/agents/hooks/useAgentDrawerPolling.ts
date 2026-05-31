import { useEffect, useRef, useState } from "react";

import { readJson } from "../shared/agentGovernanceUtils";
import type { AgentAlert, AgentDrawerData } from "../shared/types";

type Args = {
  base: string;
  selectedAgentName: string;
  setAlerts: (value: AgentAlert[]) => void;
  setError: (value: string | null) => void;
};

const DEFAULT_VISUAL_PROFILE = {
  skin: "mint_core",
  frame: "bronze_ring",
  badge: "split_master",
  title: "",
  fx_level: "low",
};

export function useAgentDrawerPolling({ base, selectedAgentName, setAlerts, setError }: Args) {
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<AgentDrawerData | null>(null);
  const [drawerVisualForm, setDrawerVisualForm] = useState(DEFAULT_VISUAL_PROFILE);
  const [savingVisual, setSavingVisual] = useState(false);
  const [levelUpPulse, setLevelUpPulse] = useState(false);
  const lastSeenLevelRef = useRef<number | null>(null);

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
  }, [base, selectedAgentName, setAlerts, setError]);

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

  return {
    drawerLoading,
    drawerData,
    setDrawerData,
    drawerVisualForm,
    setDrawerVisualForm,
    savingVisual,
    setSavingVisual,
    levelUpPulse,
  };
}
