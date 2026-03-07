export type SceneItem = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
  workunit_id: string | null;
};

export type CurrentVersion = {
  id: number;
  version_no: number;
  kind: string;
  summary: string | null;
  text_content: string | null;
};

export type DockTab = "actions" | "context" | "assist" | "report";

export type HeaderContextPayload = {
  chapterLabel: string | null;
  sceneLabel: string | null;
  sceneStatus: string | null;
};
