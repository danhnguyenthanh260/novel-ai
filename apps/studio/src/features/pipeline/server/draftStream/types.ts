export type WritingLanguage = "en" | "vi";

export type DraftStreamParsedBody = {
  body: Record<string, unknown>;
  storySlug: string;
  sceneId?: number;
  workunitId?: string;
  keywords?: string;
  maxContextTokens?: number;
  originalMessages: unknown[];
  requestedLang: string;
};
