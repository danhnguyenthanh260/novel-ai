import WriteTabClient from "@/features/scenes/components/WriteTabClient";

export const dynamic = "force-dynamic";

export default async function StoryWritePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <WriteTabClient storySlug={slug} />;
}
