import ReviewRequestsList from "@/features/reviews/components/reviewPanel/ReviewRequestsList";
import ReviewResponsesList from "@/features/reviews/components/reviewPanel/ReviewResponsesList";
import ReviewSubmitForm from "@/features/reviews/components/reviewPanel/ReviewSubmitForm";
import type { ReviewFormState, ReviewRequest, ReviewResponse, ReviewStatus } from "@/features/reviews/components/reviewPanel/types";

type ReviewPanelViewProps = {
  storySlug: string;
  filterStatus: ReviewStatus;
  onFilterStatusChange: (value: ReviewStatus) => void;
  loading: boolean;
  error: string | null;
  ok: string | null;
  requests: ReviewRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (value: number) => void;
  responses: ReviewResponse[];
  form: ReviewFormState;
  setForm: (updater: (prev: ReviewFormState) => ReviewFormState) => void;
  acting: boolean;
  onRefresh: () => Promise<void>;
  onSubmitResponse: () => Promise<void>;
  onApplyLatest: () => Promise<void>;
};

export default function ReviewPanelView({
  storySlug,
  filterStatus,
  onFilterStatusChange,
  loading,
  error,
  ok,
  requests,
  selectedRequestId,
  onSelectRequest,
  responses,
  form,
  setForm,
  acting,
  onRefresh,
  onSubmitResponse,
  onApplyLatest,
}: ReviewPanelViewProps) {
  return (
    <main className="space-y-4 p-2 md:p-4">
      <div className="surface-card flex items-center justify-between p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review Panel</h1>
          <div className="muted text-sm">story: {storySlug}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="shell-control px-2 py-1 text-sm"
            value={filterStatus}
            onChange={(e) => onFilterStatusChange((e.target.value as ReviewStatus) ?? "ALL")}
          >
            <option value="ALL">ALL</option>
            <option value="OPEN">OPEN</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="APPLIED">APPLIED</option>
          </select>
          <button type="button" className="shell-link px-3 py-2 text-sm" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-[#ff8f8f]">{error}</div>}
      {ok && <div className="text-sm text-emerald-300">{ok}</div>}

      <ReviewRequestsList requests={requests} selectedRequestId={selectedRequestId} onSelectRequest={onSelectRequest} />

      <section className="grid gap-4 lg:grid-cols-2">
        <ReviewSubmitForm
          form={form}
          setForm={setForm}
          selectedRequestId={selectedRequestId}
          acting={acting}
          onSubmitResponse={onSubmitResponse}
          onApplyLatest={onApplyLatest}
        />
        <ReviewResponsesList responses={responses} selectedRequestId={selectedRequestId} />
      </section>
    </main>
  );
}
