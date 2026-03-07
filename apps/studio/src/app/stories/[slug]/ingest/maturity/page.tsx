import IngestMaturityClient from "@/features/ingest/components/IngestMaturityClient";

export const dynamic = "force-dynamic";

export default async function StoryIngestMaturityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <IngestMaturityClient storySlug={slug} />;
}
