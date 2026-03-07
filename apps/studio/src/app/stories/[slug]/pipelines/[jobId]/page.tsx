import PipelineJobClient from "@/features/ingest/components/PipelineJobClient";

export const dynamic = "force-dynamic";

export default async function StoryPipelineJobPage({
  params,
}: {
  params: Promise<{ slug: string; jobId: string }>;
}) {
  const { slug, jobId } = await params;
  return <PipelineJobClient storySlug={slug} jobId={jobId} />;
}
