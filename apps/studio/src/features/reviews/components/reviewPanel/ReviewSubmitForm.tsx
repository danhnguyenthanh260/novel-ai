import type { ReviewFormState } from "@/features/reviews/components/reviewPanel/types";

type ReviewSubmitFormProps = {
  form: ReviewFormState;
  setForm: (updater: (prev: ReviewFormState) => ReviewFormState) => void;
  selectedRequestId: number | null;
  acting: boolean;
  onSubmitResponse: () => Promise<void>;
  onApplyLatest: () => Promise<void>;
};

export default function ReviewSubmitForm({
  form,
  setForm,
  selectedRequestId,
  acting,
  onSubmitResponse,
  onApplyLatest,
}: ReviewSubmitFormProps) {
  return (
    <div className="surface-card space-y-3 p-4">
      <div className="text-sm font-medium">Submit Response</div>
      <input
        className="shell-control w-full px-3 py-2 text-sm"
        value={form.reviewerName}
        onChange={(e) => setForm((prev) => ({ ...prev, reviewerName: e.target.value }))}
        placeholder="reviewer_name"
      />
      <textarea
        className="shell-control min-h-28 w-full px-3 py-2 font-mono text-xs"
        value={form.scoresJson}
        onChange={(e) => setForm((prev) => ({ ...prev, scoresJson: e.target.value }))}
      />
      <textarea
        className="shell-control min-h-24 w-full px-3 py-2 font-mono text-xs"
        value={form.flagsJson}
        onChange={(e) => setForm((prev) => ({ ...prev, flagsJson: e.target.value }))}
      />
      <textarea
        className="shell-control min-h-20 w-full px-3 py-2 text-sm"
        value={form.suggestionsText}
        onChange={(e) => setForm((prev) => ({ ...prev, suggestionsText: e.target.value }))}
        placeholder="suggestions_text"
      />
      <textarea
        className="shell-control min-h-28 w-full px-3 py-2 font-mono text-xs"
        value={form.canonProposalsJson}
        onChange={(e) => setForm((prev) => ({ ...prev, canonProposalsJson: e.target.value }))}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="shell-link px-3 py-2 text-sm"
          onClick={onSubmitResponse}
          disabled={!selectedRequestId || acting}
        >
          Submit Response
        </button>
        <button
          type="button"
          className="shell-link px-3 py-2 text-sm"
          onClick={onApplyLatest}
          disabled={!selectedRequestId || acting}
        >
          Apply Latest
        </button>
      </div>
    </div>
  );
}
