import IngestJobsClient from "@/features/ingest/components/IngestJobsClient";

export const dynamic = "force-dynamic";

export default async function StoryIngestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <IngestJobsClient storySlug={slug} />;
}
