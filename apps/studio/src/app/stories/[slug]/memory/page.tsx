import MemoryHubPage from "@/features/memory/components/MemoryHubPage";

export const dynamic = "force-dynamic";

export default async function StoryMemoryHubRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MemoryHubPage storySlug={slug} />;
}
