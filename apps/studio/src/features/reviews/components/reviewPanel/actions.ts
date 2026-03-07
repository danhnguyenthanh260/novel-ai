import type { ReviewRequest, ReviewResponse } from "@/features/reviews/components/reviewPanel/types";

export const DEFAULT_REVIEWER_NAME = "reviewer_1";
export const DEFAULT_SCORES_JSON = `{
  "logic": 4,
  "pacing": 4,
  "consistency": 4,
  "voice": 4
}`;
export const DEFAULT_FLAGS_JSON = `{
  "critical": [],
  "major": [],
  "minor": []
}`;
export const DEFAULT_CANON_PROPOSALS_JSON = `[
  {
    "category": "lore",
    "content": "The bridge opens only at dusk.",
    "importance": 4
  }
]`;

export function normalizeRequests(payload: unknown): ReviewRequest[] {
  return Array.isArray(payload) ? (payload as ReviewRequest[]) : [];
}

export function normalizeResponses(payload: unknown): ReviewResponse[] {
  return Array.isArray(payload) ? (payload as ReviewResponse[]) : [];
}

export function chooseSelectedRequestId(requests: ReviewRequest[], current: number | null): number | null {
  if (requests.length === 0) return null;
  if (!current || !requests.some((r) => r.id === current)) return requests[0].id;
  return current;
}

export function parseSubmitPayload(scoresJson: string, flagsJson: string, canonProposalsJson: string) {
  const scores = JSON.parse(scoresJson);
  const flags = JSON.parse(flagsJson);
  const proposals = JSON.parse(canonProposalsJson);

  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new Error("INVALID_SCORES_JSON");
  }
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    throw new Error("INVALID_FLAGS_JSON");
  }
  if (!Array.isArray(proposals)) {
    throw new Error("INVALID_CANON_PROPOSALS_JSON");
  }

  return { scores, flags, proposals };
}
