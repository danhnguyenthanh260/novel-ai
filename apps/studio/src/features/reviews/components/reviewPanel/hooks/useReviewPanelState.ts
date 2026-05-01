import { useCallback, useEffect, useMemo, useState } from "react";
import { apiBase } from "@/lib/apiBase";
import {
  chooseSelectedRequestId,
  DEFAULT_CANON_PROPOSALS_JSON,
  DEFAULT_FLAGS_JSON,
  DEFAULT_REVIEWER_NAME,
  DEFAULT_SCORES_JSON,
  normalizeRequests,
  normalizeResponses,
  parseSubmitPayload,
} from "@/features/reviews/components/reviewPanel/actions";
import type { ReviewFormState, ReviewRequest, ReviewResponse, ReviewStatus } from "@/features/reviews/components/reviewPanel/types";

type UseReviewPanelStateResult = {
  requests: ReviewRequest[];
  responses: ReviewResponse[];
  selectedRequestId: number | null;
  setSelectedRequestId: (value: number | null) => void;
  filterStatus: ReviewStatus;
  setFilterStatus: (value: ReviewStatus) => void;
  loading: boolean;
  acting: boolean;
  error: string | null;
  ok: string | null;
  form: ReviewFormState;
  setForm: (updater: (prev: ReviewFormState) => ReviewFormState) => void;
  loadRequests: () => Promise<void>;
  submitResponse: () => Promise<void>;
  applyLatest: () => Promise<void>;
  acceptLedger: () => Promise<void>;
  applyPatch: (issueId: number) => Promise<void>;
  v3Data: any;
};

function buildStateResult(
  args: UseReviewPanelStateResult
): UseReviewPanelStateResult {
  return args;
}

function useReviewFormState() {
  return useState<ReviewFormState>({
    reviewerName: DEFAULT_REVIEWER_NAME,
    scoresJson: DEFAULT_SCORES_JSON,
    flagsJson: DEFAULT_FLAGS_JSON,
    suggestionsText: "",
    canonProposalsJson: DEFAULT_CANON_PROPOSALS_JSON,
  });
}

function useReviewPolling(
  selectedRequestId: number | null,
  loadRequests: () => Promise<void>,
  loadResponses: (requestId: number) => Promise<void>
) {
  useEffect(() => {
    loadRequests();
    const timer = window.setInterval(loadRequests, 4000);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  useEffect(() => {
    if (!selectedRequestId) return;
    loadResponses(selectedRequestId);
    const timer = window.setInterval(() => loadResponses(selectedRequestId), 4000);
    return () => window.clearInterval(timer);
  }, [loadResponses, selectedRequestId]);
}

function useSubmitResponseAction(args: {
  acting: boolean;
  base: string;
  form: ReviewFormState;
  selectedRequestId: number | null;
  setActing: (value: boolean) => void;
  setError: (value: string | null) => void;
  setOk: (value: string | null) => void;
  loadRequests: () => Promise<void>;
  loadResponses: (requestId: number) => Promise<void>;
}) {
  const { acting, base, form, selectedRequestId, setActing, setError, setOk, loadRequests, loadResponses } = args;
  return useCallback(async () => {
    if (!selectedRequestId || acting) return;
    setActing(true);
    setError(null);
    setOk(null);
    try {
      const { scores, flags, proposals } = parseSubmitPayload(form.scoresJson, form.flagsJson, form.canonProposalsJson);
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_response",
          request_id: selectedRequestId,
          reviewer_name: form.reviewerName.trim() || null,
          scores_json: scores,
          flags_json: flags,
          suggestions_text: form.suggestionsText || null,
          canon_proposals_json: proposals,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `SUBMIT_REVIEW_FAILED_${res.status}`);
      setOk(`Submitted response #${json.response_id}`);
      await loadRequests();
      await loadResponses(selectedRequestId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "SUBMIT_REVIEW_FAILED");
    } finally {
      setActing(false);
    }
  }, [acting, base, form, loadRequests, loadResponses, selectedRequestId, setActing, setError, setOk]);
}

function useApplyLatestAction(args: {
  acting: boolean;
  base: string;
  selectedRequestId: number | null;
  setActing: (value: boolean) => void;
  setError: (value: string | null) => void;
  setOk: (value: string | null) => void;
  loadRequests: () => Promise<void>;
  loadResponses: (requestId: number) => Promise<void>;
}) {
  const { acting, base, selectedRequestId, setActing, setError, setOk, loadRequests, loadResponses } = args;
  return useCallback(async () => {
    if (!selectedRequestId || acting) return;
    setActing(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_response",
          request_id: selectedRequestId,
          applied_by: "operator_ui",
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `APPLY_REVIEW_FAILED_${res.status}`);
      setOk(`Applied response #${json.response_id}. Canon inserted: ${(json.canon_inserted_ids ?? []).length}`);
      await loadRequests();
      await loadResponses(selectedRequestId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "APPLY_REVIEW_FAILED");
    } finally {
      setActing(false);
    }
  }, [acting, base, loadRequests, loadResponses, selectedRequestId, setActing, setError, setOk]);
}

export function useReviewPanelState(storySlug: string): UseReviewPanelStateResult {
  const base = useMemo(() => `${apiBase(storySlug)}/reviews`, [storySlug]);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [responses, setResponses] = useState<ReviewResponse[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<ReviewStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useReviewFormState();
  const [v3Data, setV3Data] = useState<any>(null);

  const loadResponses = useCallback(
    async (requestId: number) => {
      try {
        const res = await fetch(`${base}?request_id=${requestId}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `GET_REVIEW_RESPONSES_FAILED_${res.status}`);
        setResponses(normalizeResponses(json?.responses));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "GET_REVIEW_RESPONSES_FAILED");
        setResponses([]);
      }
    },
    [base]
  );

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = filterStatus === "ALL" ? "" : `?status=${filterStatus}`;
      const res = await fetch(`${base}${q}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `GET_REVIEW_REQUESTS_FAILED_${res.status}`);
      const items = normalizeRequests(json?.requests);
      setRequests(items);

      const chosen = chooseSelectedRequestId(items, selectedRequestId);
      setSelectedRequestId(chosen);
      if (!chosen) {
        setResponses([]);
        setV3Data(null);
      } else {
        setV3Data(json?.v3_data || null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "GET_REVIEW_REQUESTS_FAILED");
      setRequests([]);
      setResponses([]);
      setSelectedRequestId(null);
    } finally {
      setLoading(false);
    }
  }, [base, filterStatus, selectedRequestId]);

  useReviewPolling(selectedRequestId, loadRequests, loadResponses);

  const submitResponse = useSubmitResponseAction({
    acting,
    base,
    form,
    selectedRequestId,
    setActing,
    setError,
    setOk,
    loadRequests,
    loadResponses,
  });

  const applyLatest = useApplyLatestAction({
    acting,
    base,
    selectedRequestId,
    setActing,
    setError,
    setOk,
    loadRequests,
    loadResponses,
  });

  const acceptLedger = useCallback(async () => {
    if (!selectedRequestId || acting) return;
    setActing(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept_ledger",
          request_id: selectedRequestId,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? "ACCEPT_LEDGER_FAILED");
      setOk(`Ledger accepted. Canon facts inserted: ${json.count}`);
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ACCEPT_LEDGER_FAILED");
    } finally {
      setActing(false);
    }
  }, [acting, base, loadRequests, selectedRequestId]);

  const applyPatch = useCallback(async (issueId: number) => {
    if (!selectedRequestId || acting) return;
    setActing(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_patch",
          request_id: selectedRequestId,
          response_id: issueId, // Reusing response_id as issue_id
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? "APPLY_PATCH_FAILED");
      setOk(`Patch applied to chapter. Issue marked as resolved.`);
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "APPLY_PATCH_FAILED");
    } finally {
      setActing(false);
    }
  }, [acting, base, loadRequests, selectedRequestId]);

  return buildStateResult({
    requests,
    responses,
    selectedRequestId,
    setSelectedRequestId,
    filterStatus,
    setFilterStatus,
    loading,
    acting,
    error,
    ok,
    form,
    setForm,
    loadRequests,
    submitResponse,
    applyLatest,
    acceptLedger,
    applyPatch,
    v3Data,
  });
}
