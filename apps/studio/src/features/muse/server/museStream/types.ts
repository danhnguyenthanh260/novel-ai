import type { MuseRule } from "@/features/prompts/server/musePromptBuilder";

export type MuseStreamParsedRequest = {
  body: Record<string, unknown>;
  mode: "bullets" | "block";
  history: string[];
  focusText: string;
  storySlug: string;
  sceneId: number;
  writingLanguage: "en" | "vi";
};

export type MuseStoryContext = {
  rules: MuseRule[];
  contextInjection: string;
};
