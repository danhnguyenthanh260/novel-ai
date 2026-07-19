import RootStoryBootstrap from "@/app/RootStoryBootstrap";
import DemoStudioFallback from "@/features/demo/components/DemoStudioFallback";
import WriteTabClient from "@/features/scenes/components/WriteTabClient";
import { listStories } from "@/features/scenes/server/workflow/repoStory";
import { pool } from "@/server/db/pool";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const stories = await listStories(pool);
    const storySlug = stories[0]?.slug;

    if (!storySlug) {
      return <RootStoryBootstrap />;
    }

    return <WriteTabClient storySlug={storySlug} />;
  } catch (error) {
    console.error("ROOT_STUDIO_BOOTSTRAP_FAILED", error);
    return <DemoStudioFallback />;
  }
}
