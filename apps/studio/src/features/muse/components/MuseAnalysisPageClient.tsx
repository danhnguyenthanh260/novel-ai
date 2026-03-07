"use client";

import MuseAnalysisPageView from "@/features/muse/components/museAnalysis/MuseAnalysisPageView";
import { useMuseAnalysisState } from "@/features/muse/components/museAnalysis/hooks/useMuseAnalysisState";

export default function MuseAnalysisPageClient({ storySlug }: { storySlug: string }) {
  const state = useMuseAnalysisState(storySlug);

  return (
    <MuseAnalysisPageView
      storySlug={storySlug}
      mode={state.mode}
      setMode={state.setMode}
      error={state.error}
      flash={state.flash}
      sceneFilter={state.sceneFilter}
      setSceneFilter={state.setSceneFilter}
      loadingScenes={state.loadingScenes}
      scenes={state.scenes}
      draft={state.draft}
      setDraft={state.setDraft}
      debouncedDraft={state.debouncedDraft}
      canSave={state.canSave}
      saving={state.saving}
      saveReport={state.saveReport}
      items={state.items}
      selectedId={state.selectedId}
      setSelectedId={state.setSelectedId}
      selectedItem={state.selectedItem}
      loadingList={state.loadingList}
      deletingId={state.deletingId}
      loadList={state.loadList}
      deleteReport={state.deleteReport}
    />
  );
}
