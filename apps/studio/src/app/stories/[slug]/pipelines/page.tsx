import PipelinesIndexClient from "@/features/ingest/components/PipelinesIndexClient";

export const dynamic = "force-dynamic";

export default async function StoryPipelinesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PipelinesIndexClient storySlug={slug} />;
}
