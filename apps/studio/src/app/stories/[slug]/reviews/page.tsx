import ReviewPanelClient from "@/features/reviews/components/ReviewPanelClient";

export const dynamic = "force-dynamic";

export default async function StoryReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ReviewPanelClient storySlug={slug} />;
}
