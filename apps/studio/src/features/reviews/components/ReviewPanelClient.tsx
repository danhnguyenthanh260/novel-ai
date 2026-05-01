"use client";

import ReviewPanelView from "@/features/reviews/components/reviewPanel/ReviewPanelView";
import { useReviewPanelState } from "@/features/reviews/components/reviewPanel/hooks/useReviewPanelState";

export default function ReviewPanelClient({ storySlug }: { storySlug: string }) {
  const state = useReviewPanelState(storySlug);

  return (
    <ReviewPanelView
      storySlug={storySlug}
      filterStatus={state.filterStatus}
      onFilterStatusChange={state.setFilterStatus}
      loading={state.loading}
      error={state.error}
      ok={state.ok}
      requests={state.requests}
      selectedRequestId={state.selectedRequestId}
      onSelectRequest={state.setSelectedRequestId}
      responses={state.responses}
      form={state.form}
      setForm={state.setForm}
      acting={state.acting}
      onRefresh={state.loadRequests}
      onSubmitResponse={state.submitResponse}
      onApplyLatest={state.applyLatest}
      onAcceptLedger={state.acceptLedger}
      onApplyPatch={state.applyPatch}
      v3Data={state.v3Data}
    />
  );
}
