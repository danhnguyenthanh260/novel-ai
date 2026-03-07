"use client";

import { useRouter } from "next/navigation";
import ShelfPageView from "@/features/story/components/shelf/ShelfPageView";
import { useShelfState } from "@/features/story/components/shelf/hooks/useShelfState";
import { useStory } from "@/features/story/StoryContext";

export default function ShelfPageClient() {
  const router = useRouter();
  const { setStorySlug } = useStory();
  const state = useShelfState();

  return (
    <ShelfPageView
      items={state.items}
      loading={state.loading}
      error={state.error}
      q={state.q}
      setQ={state.setQ}
      tagsInput={state.tagsInput}
      setTagsInput={state.setTagsInput}
      cautionsInput={state.cautionsInput}
      setCautionsInput={state.setCautionsInput}
      scope={state.scope}
      setScope={state.setScope}
      actingSlug={state.actingSlug}
      onApplyFilter={() => state.setQueryKey((x) => x + 1)}
      onOpen={(slug) => {
        setStorySlug(slug);
        router.push(`/stories/${slug}`);
      }}
      onTogglePublished={state.toggleDraftPublished}
      onDelete={state.deleteStory}
      onUploadCover={state.uploadCover}
    />
  );
}
