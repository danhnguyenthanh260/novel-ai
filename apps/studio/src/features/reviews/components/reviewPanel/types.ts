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

export type V3LedgerFact = {
  fact?: string;
  content?: string;
  confidence?: number;
};

export type V3ContinuityIssue = {
  id: number;
  issue_type?: string;
  severity?: string;
  description?: string;
  payload?: unknown;
  status?: string;
  auto_patch_available?: boolean;
  patch_suggestion?: string;
};

export type V3ReviewData = {
  ledger:
    | {
        added_facts?: V3LedgerFact[];
        modified_states?: unknown;
        unresolved_loops?: unknown[];
        is_stale?: boolean;
        stale_reason?: string | null;
      }
    | null;
  issues: V3ContinuityIssue[];
};

export type ReviewFormState = {
  reviewerName: string;
  scoresJson: string;
  flagsJson: string;
  suggestionsText: string;
  canonProposalsJson: string;
};
