import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function StoryLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/stories/${encodeURIComponent(slug)}/write?scope=story`);
}
