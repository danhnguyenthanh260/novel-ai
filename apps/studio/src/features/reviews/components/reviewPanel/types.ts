export type ReviewStatus = "ALL" | "OPEN" | "SUBMITTED" | "APPLIED";

export type ReviewRequest = {
  id: number;
  scene_version_id: number;
  job_id: number | null;
  status: "OPEN" | "SUBMITTED" | "APPLIED";
  rubric_version: string;
  created_at: string;
  scene_id: number;
  version_no: number;
  workunit_id: string | null;
  chapter_id: string | null;
  legacy_chapter_id: string | null;
  is_v3: boolean;
  idx: number;
};

export type ReviewResponse = {
  id: number;
  reviewer_name: string | null;
  scores_json: Record<string, unknown>;
  flags_json: Record<string, unknown>;
  suggestions_text: string | null;
  canon_proposals_json: unknown[];
  created_at: string;
};

export type ReviewFormState = {
  reviewerName: string;
  scoresJson: string;
  flagsJson: string;
  suggestionsText: string;
  canonProposalsJson: string;
};
