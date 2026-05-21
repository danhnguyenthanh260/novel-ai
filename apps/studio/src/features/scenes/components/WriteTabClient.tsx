"use client";

import { useSearchParams } from "next/navigation";
import WriteTabView from "@/features/scenes/components/writeTab/WriteTabView";
import { useWriteTabState } from "@/features/scenes/components/writeTab/hooks/useWriteTabState";
import type { ChatScope } from "@/features/scenes/components/writeTab/types";

export default function WriteTabClient({ storySlug }: { storySlug: string }) {
  const params = useSearchParams();
  const state = useWriteTabState(storySlug);
  const chatScope: ChatScope = params.get("scope") === "story" ? "story" : "chapter";

  return (
    <WriteTabView
      storySlug={storySlug}
      chatScope={chatScope}
      scenes={state.scenes}
      chapterIds={state.chapterIds}
      sceneId={state.sceneId}
      onSceneIdChange={state.setSceneId}
      scene={state.scene}
      current={state.current}
      loadingScenes={state.loadingScenes}
      loadingDetail={state.loadingDetail}
      error={state.error}
      dockTab={state.dockTab}
      onDockTabChange={state.setDockTab}
      ghostSuggestionReady={state.ghostSuggestionReady}
      seedPrompt={state.seedPrompt}
      onCommitted={state.reloadDetail}
      onGhostSuggestionReadyChange={state.setGhostSuggestionReady}
      // New Chapter-level props
      selectedChapterId={state.selectedChapterId}
      onChapterIdChange={state.setSelectedChapterId}
      viewMode={state.viewMode}
      chapterScenes={state.chapterScenes}
      loadingChapter={state.loadingChapter}
      onCreateNewChapter={state.createNewChapter}
      onUnlockScene={state.unlockScene}
      showAutoWrite={state.showAutoWrite}
      setShowAutoWrite={state.setShowAutoWrite}
      pendingChapterProse={state.pendingChapterProse}
      onAutoWriteComplete={state.handleAutoWriteComplete}
      stagingData={state.stagingData}
      v3Draft={state.v3Draft}
      onSaveChapterDraft={state.saveChapterDraft}
      onResplitChapter={state.resplitChapter}
    />
  );
}
