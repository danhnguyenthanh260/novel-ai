export type MuseAnalysisMode = "edit" | "preview";

export type SceneItem = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
};

export type MuseAnalysisItem = {
  id: string;
  story_id: number;
  scene_id: number | null;
  raw_content_md: string;
  created_by: string;
  created_at: string;
};
