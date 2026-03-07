import type { SceneStatus } from "./stateMachine";
export type { SceneStatus } from "./stateMachine";

export type VersionKind = "outline" | "draft" | "rewrite" | "evaluate";

export type PipelineStep = "intake" | "outline" | "draft" | "evaluate" | "rewrite" | "lock" | "unlock";

export type EvalJson = {
  rubric: {
    logic: number;
    pacing: number;
    consistency: number;
    voice: number;
  };
  overall: number;
  issues: string[];
  suggestions: string[];
  meta: {
    model: string;
    prompt_rev: string;
    ts: string;
  };
};

export type SceneRow = {
  id: number;
  story_id: number;
  workunit_id: string | null;
  chapter_id: string | null;
  idx: number;
  title: string | null;
  status: SceneStatus;
  current_version_id: number | null;
  created_at?: string;
  updated_at?: string;
};

export type SceneVersionRow = {
  id: number;
  story_id: number;
  scene_id: number;
  version_no: number;
  kind: VersionKind;
  text_content: string | null;
  beats_json: unknown | null;
  eval_json: unknown | null;
  summary: string | null;
  created_at?: string;
};

export type PipelineRunInput = Record<string, unknown>;
export type PipelineRunOutput = Record<string, unknown>;
export type LlmParams = Record<string, unknown>;
