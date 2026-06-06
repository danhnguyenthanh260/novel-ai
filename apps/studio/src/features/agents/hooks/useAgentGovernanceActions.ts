/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback } from "react";

import { readJson } from "../shared/agentGovernanceUtils";
import type { AgentDrawerData, AgentMemory, AgentRunDetail, PromptDiffChunk } from "../shared/types";
import type { PROMOTION_REASON_TEMPLATES } from "../shared/agentGovernanceConstants";

type ActionModal = { mode: "archive" | "rollback" | "promote_active"; versionId: number } | null;

type Args = {
  base: string;
  loadAll: () => Promise<void>;
  setError: (value: string | null) => void;
  actionModal: ActionModal;
  setActionModal: (value: ActionModal) => void;
  actionReason: string;
  setActionReason: (value: string) => void;
  rollbackTargetVersion: number | "";
  setRollbackTargetVersion: (value: number | "") => void;
  promoteAuthor: string;
  setPromoteAuthor: (value: string) => void;
  promoteApprovedBy: string;
  setPromoteApprovedBy: (value: string) => void;
  promoteReasonTemplate: (typeof PROMOTION_REASON_TEMPLATES)[number];
  setPromoteReasonTemplate: (value: (typeof PROMOTION_REASON_TEMPLATES)[number]) => void;
  promoteLookbackHours: number | "";
  setPromoteLookbackHours: (value: number | "") => void;
  promoteMinSamples: number | "";
  setPromoteMinSamples: (value: number | "") => void;
  actionBusy: boolean;
  setActionBusy: (value: boolean) => void;
  setRunDetailLoading: (value: boolean) => void;
  setRunDetail: (value: AgentRunDetail | null) => void;
  diffLeft: number | "";
  diffRight: number | "";
  setDiffChunks: (value: PromptDiffChunk[]) => void;
  feedbackText: string;
  setFeedbackText: (value: string) => void;
  feedbackAgent: string;
  feedbackType: string;
  retrieveEmbedding: string;
  setMemories: (value: AgentMemory[]) => void;
  selectedAgentName: string;
  drawerData: AgentDrawerData | null;
  drawerVisualForm: AgentDrawerData["visual_profile"];
  setSavingVisual: (value: boolean) => void;
  setDrawerData: (value: AgentDrawerData | null) => void;
};

export function useAgentGovernanceActions(args: Args) {
  const {
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
  } = args;

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

  return {
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
  };
}
