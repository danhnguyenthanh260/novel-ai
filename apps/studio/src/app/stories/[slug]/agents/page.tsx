import AgentControlCenterClient from "@/features/agents/components/AgentControlCenterClient";

export const dynamic = "force-dynamic";

export default async function StoryAgentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AgentControlCenterClient storySlug={slug} />;
}
