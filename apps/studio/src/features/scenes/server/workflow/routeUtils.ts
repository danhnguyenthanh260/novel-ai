import type { Pool } from "pg";
import { ensureStoryBySlug } from "./repoStory";

export function parseSceneId(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export async function resolveStoryId(pool: Pool, storySlug: string): Promise<number> {
  const story = await ensureStoryBySlug(pool, { slug: storySlug });
  return story.id;
}

export async function resolveStoryIdForWrite(pool: Pool, storySlug: string): Promise<number> {
  const story = await ensureStoryBySlug(pool, { slug: storySlug });
  if (story.status === "ARCHIVED") {
    throw new Error("STORY_ARCHIVED");
  }
  return story.id;
}
