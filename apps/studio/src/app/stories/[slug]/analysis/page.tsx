import AnalysisWorkspacePage from "@/features/analysis/components/AnalysisWorkspacePage";

export const dynamic = "force-dynamic";

export default async function StoryHistorianAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AnalysisWorkspacePage storySlug={slug} />;
}
