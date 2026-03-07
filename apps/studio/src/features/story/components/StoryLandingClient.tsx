"use client";

import StoryLandingView from "@/features/story/components/storyLanding/StoryLandingView";
import { useStoryLandingState } from "@/features/story/components/storyLanding/hooks/useStoryLandingState";

export default function StoryLandingClient({ slug }: { slug: string }) {
  const state = useStoryLandingState(slug);

  if (state.loading) return <main className="p-4 muted">Loading story...</main>;
  if (state.error) return <main className="p-4 text-[#ff8f8f]">{state.error}</main>;
  if (!state.item) return <main className="p-4 muted">Story not found.</main>;

  return (
    <StoryLandingView
      slug={slug}
      item={state.item}
      chapters={state.chapters}
      arcs={state.arcs}
      cover={state.cover}
      background={state.background}
      totalScenes={state.totalScenes}
      saveMeta={state.saveMeta}
      uploadCover={state.uploadCover}
      createArc={state.createArc}
      deleteArc={state.deleteArc}
      assignChapterToArc={state.assignChapterToArc}
    />
  );
}
