import MuseAnalysisPageClient from "@/features/muse/components/MuseAnalysisPageClient";

export const dynamic = "force-dynamic";

export default async function StoryMuseAnalysisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MuseAnalysisPageClient storySlug={slug} />;
}

