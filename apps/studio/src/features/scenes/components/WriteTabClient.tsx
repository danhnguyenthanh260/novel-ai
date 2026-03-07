"use client";

import WriteTabView from "@/features/scenes/components/writeTab/WriteTabView";
import { useWriteTabState } from "@/features/scenes/components/writeTab/hooks/useWriteTabState";

export default function WriteTabClient({ storySlug }: { storySlug: string }) {
  const state = useWriteTabState(storySlug);

  return (
    <WriteTabView
      storySlug={storySlug}
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
      onSaveChapterDraft={state.saveChapterDraft}
      onResplitChapter={state.resplitChapter}
    />
  );
}
