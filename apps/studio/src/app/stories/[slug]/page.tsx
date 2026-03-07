import StoryLandingClient from "@/features/story/components/StoryLandingClient";

export const runtime = "nodejs";

export default async function StoryLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StoryLandingClient slug={slug} />;
}
