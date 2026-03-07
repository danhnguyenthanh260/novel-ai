import AnalysisOperationsPanel from "@/features/analysis/components/AnalysisOperationsPanel";

export const dynamic = "force-dynamic";

export default async function StoryHistorianAnalysisOperationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AnalysisOperationsPanel storySlug={slug} />;
}

