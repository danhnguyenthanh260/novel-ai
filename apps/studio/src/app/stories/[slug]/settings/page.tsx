import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import { getDictionaryEntries } from "@/features/dictionary/server/dictionaryService";
import StoryConsole from "@/features/story/StoryConsole";

export const dynamic = "force-dynamic";

export default async function StorySettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let storyId: number;
  let entries = [];
  try {
    storyId = await resolveStoryId(pool, slug);
    entries = await getDictionaryEntries(storyId);
  } catch (e) {
    return <div className="p-4 text-red-500">Story not found or database error.</div>;
  }

  return <StoryConsole slug={slug} storyId={storyId} initialEntries={entries} />;
}
