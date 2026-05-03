import WriteTabClient from "@/features/scenes/components/WriteTabClient";
import { listStories } from "@/features/scenes/server/workflow/repoStory";
import { pool } from "@/server/db/pool";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stories = await listStories(pool);
  const storySlug = stories[0]?.slug ?? "default";

  return <WriteTabClient storySlug={storySlug} />;
}
