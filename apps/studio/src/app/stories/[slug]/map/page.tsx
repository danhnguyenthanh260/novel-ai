import MapPageClient from "@/features/map/components/MapPageClient";

export const dynamic = "force-dynamic";

export default async function StoryMapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MapPageClient storySlug={slug} />;
}

