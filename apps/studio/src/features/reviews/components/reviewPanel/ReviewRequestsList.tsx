import type { ReviewRequest } from "@/features/reviews/components/reviewPanel/types";

type ReviewRequestsListProps = {
  requests: ReviewRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (value: number) => void;
};

export default function ReviewRequestsList({ requests, selectedRequestId, onSelectRequest }: ReviewRequestsListProps) {
  return (
    <section className="surface-card">
      <div className="border-b border-[#223247] px-4 py-3 text-sm font-medium">Requests</div>
      <div className="divide-y">
        {requests.map((req) => (
          <button
            key={req.id}
            type="button"
            className={`w-full px-4 py-3 text-left text-sm ${selectedRequestId === req.id ? "bg-[#152232]" : ""}`}
            onClick={() => onSelectRequest(req.id)}
          >
            <div className="font-medium">
              Request #{req.id} | {req.status} | scene {req.workunit_id ?? req.scene_id}
            </div>
            <div className="muted">
              job: {req.job_id ?? "-"} | version: v{req.version_no} | rubric: {req.rubric_version}
            </div>
          </button>
        ))}
        {requests.length === 0 && <div className="muted px-4 py-4 text-sm">No review requests.</div>}
      </div>
    </section>
  );
}
