/**
 * Authoring Core V3: Chapter-First Type Definitions
 */

export type ChapterDraftStatus = "DRAFT" | "FINAL" | "ARCHIVED";

export interface SceneMarker {
  idx: number;
  title: string | null;
  offset: number; // Character offset in full_text
}

export interface ChapterDraft {
  id: number;
  story_id: number;
  chapter_id: string;
  version_no: number;
  full_text: string;
  scene_markers: SceneMarker[];
  status: ChapterDraftStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface AddedFact {
  id: string;
  fact: string;
  confidence: number;
  entity_type?: string;
}

export interface ModifiedStates {
  [characterId: string]: {
    [property: string]: any;
  };
}

export interface UnresolvedLoop {
  description: string;
  urgency: number;
  origin_chapter_id?: string;
}

export interface ChapterLedger {
  id: number;
  story_id: number;
  chapter_id: string;
  draft_id: number | null;
  added_facts: AddedFact[];
  modified_states: ModifiedStates;
  resolved_loops: string[]; // List of loop IDs or descriptions
  unresolved_loops: UnresolvedLoop[];
  is_stale: boolean;
  stale_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export type ContinuityIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ContinuityIssue {
  id: number;
  story_id: number;
  chapter_id: string;
  issue_type: string;
  severity: ContinuityIssueSeverity;
  description: string;
  payload: {
    evidence?: string;
    suggested_fix?: string;
    location_marker?: string;
  };
  is_resolved: boolean;
  created_at: Date;
}
