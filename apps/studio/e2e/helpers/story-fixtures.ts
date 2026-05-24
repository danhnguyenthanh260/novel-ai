import type { APIRequestContext } from "@playwright/test";

export type StoryFixture = {
  slug: string;
  title: string;
};

function makeTestSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `e2e_test_${ts}_${rand}`;
}

export async function createTestStory(
  request: APIRequestContext,
  baseURL: string,
  overrides: Partial<{ title: string; slug: string }> = {}
): Promise<StoryFixture> {
  const slug = overrides.slug ?? makeTestSlug();
  const title = overrides.title ?? "E2E Test Novel — Five Chapter Flow";

  const res = await request.post(`${baseURL}/api/stories`, {
    data: {
      slug,
      title,
      status: "ACTIVE",
      system_prompt: null,
      tone_profile_json: {},
      default_llm_params_json: {},
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to create test story (${res.status()}): ${body}`);
  }

  return { slug, title };
}

export async function archiveTestStory(
  request: APIRequestContext,
  baseURL: string,
  slug: string
): Promise<void> {
  try {
    await request.patch(`${baseURL}/api/stories/${encodeURIComponent(slug)}`, {
      data: { status: "ARCHIVED" },
    });
  } catch {
    // Best-effort cleanup; do not fail tests on cleanup error
  }
}

export function writeWorkspaceUrl(slug: string): string {
  return `/stories/${encodeURIComponent(slug)}/write`;
}
