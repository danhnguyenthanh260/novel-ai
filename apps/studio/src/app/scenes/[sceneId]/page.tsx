import SceneDetailClient from "@/features/scenes/components/SceneDetailClient";

export const dynamic = "force-dynamic";

export default async function SceneDetailPage({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  return <SceneDetailClient sceneId={sceneId} />;
}
