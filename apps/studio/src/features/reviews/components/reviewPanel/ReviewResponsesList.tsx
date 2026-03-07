import type { ReviewResponse } from "@/features/reviews/components/reviewPanel/types";

type ReviewResponsesListProps = {
  responses: ReviewResponse[];
  selectedRequestId: number | null;
};

export default function ReviewResponsesList({ responses, selectedRequestId }: ReviewResponsesListProps) {
  return (
    <div className="surface-card">
      <div className="border-b border-[#223247] px-4 py-3 text-sm font-medium">
        Responses {selectedRequestId ? `(request #${selectedRequestId})` : ""}
      </div>
      <div className="divide-y">
        {responses.map((res) => (
          <div key={res.id} className="px-4 py-3 text-sm">
            <div className="font-medium">
              Response #{res.id} | by: {res.reviewer_name ?? "-"}
            </div>
            <div className="muted">created: {new Date(res.created_at).toLocaleString()}</div>
            {res.suggestions_text && <div className="mt-1">{res.suggestions_text}</div>}
          </div>
        ))}
        {selectedRequestId && responses.length === 0 && <div className="muted px-4 py-4 text-sm">No responses yet.</div>}
        {!selectedRequestId && <div className="muted px-4 py-4 text-sm">Select a request to view responses.</div>}
      </div>
    </div>
  );
}
