import Link from "next/link";
import { useState } from "react";
import DraftRunner from "@/features/scenes/components/DraftRunner";
import ChapterReader from "@/features/scenes/components/writeTab/ChapterReader";
import AutoWriteWizard from "@/features/scenes/components/writeTab/AutoWriteWizard";
import type { CurrentVersion, SceneItem } from "@/features/scenes/components/writeTab/types";

type WriteTabCenterPanelProps = {
  storySlug: string;
  scenes: SceneItem[];
  chapterIds: string[];
  sceneId: string;
  onSceneIdChange: (value: string) => void;
  scene: SceneItem | null;
  current: CurrentVersion | null;
  loadingScenes: boolean;
  loadingDetail: boolean;
  error: string | null;
  seedPrompt: string;
  onCommitted: () => Promise<void>;
  onGhostSuggestionReadyChange: (value: boolean) => void;
  // New Chapter-level props
  selectedChapterId: string;
  onChapterIdChange: (id: string) => void;
  viewMode: "scene" | "chapter";
  chapterScenes: any[];
  loadingChapter: boolean;
  onCreateNewChapter: () => Promise<void>;
  onUnlockScene: () => Promise<void>;
  showAutoWrite: boolean;
  setShowAutoWrite: (v: boolean) => void;
  pendingChapterProse: { id: string; prose: string } | null;
  stagingData: { user_prose: string; llm_prose: string; status: string } | null;
  onAutoWriteComplete: (prose: string) => Promise<void>;
  onSaveChapterDraft: (prose: string) => Promise<void>;
  onResplitChapter: (prose: string) => Promise<void>;
  v3Draft?: { full_text: string; status: string; virtual_scenes: any[] } | null;
};

type SceneHeaderProps = {
  storySlug: string;
  scenes: SceneItem[];
  chapterIds: string[];
  sceneId: string;
  loadingScenes: boolean;
  scene: SceneItem | null;
  onSceneIdChange: (value: string) => void;
  selectedChapterId: string;
  onChapterIdChange: (id: string) => void;
  onCreateNewChapter: () => Promise<void>;
  onUnlockScene: () => Promise<void>;
  onOpenAutoWrite: () => void;
  viewMode: "scene" | "chapter";
};

function SceneHeader({
  storySlug,
  scenes,
  chapterIds,
  sceneId,
  loadingScenes,
  scene,
  onSceneIdChange,
  selectedChapterId,
  onChapterIdChange,
  onCreateNewChapter,
  onUnlockScene,
  onOpenAutoWrite,
  viewMode,
}: SceneHeaderProps) {
  const chapterOptions = chapterIds.length > 0
    ? chapterIds
    : scenes
      .map((s) => s.chapter_id || "")
      .filter(Boolean)
      .sort();

  return (
    <div className="surface-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">Studio</span>
        <span className="muted text-xs mx-2">/</span>
        <span className="text-xs font-bold uppercase tracking-widest text-[#9de5dc]">
          {selectedChapterId ? `Chapter ${selectedChapterId}` : "Story View"}
        </span>
        {scene && (
          <>
            <span className="muted text-xs mx-1">›</span>
            <span className="text-xs muted font-mono">Scene #{scene.idx}</span>
          </>
        )}
        <span className="muted text-xs ml-4">/</span>
        <span className={`status-pill ml-1 ${scene?.status === "LOCKED" ? "status-pill--locked" : "status-pill--other"}`}>
          {scene?.status ?? "READ_ONLY"}
        </span>
        {scene?.status === "LOCKED" && (
          <button
            type="button"
            className="shell-link px-2 py-0.5 text-[10px] font-bold text-[#ff8f8f] border border-[#ff8f8f]/30 ml-2 rounded hover:bg-[#ff8f8f]/5"
            onClick={() => onUnlockScene()}
          >
            UNLOCK FOR EDIT
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="shell-control min-w-48 px-3 py-1.5 text-sm font-bold bg-[#131313] border-white/10 rounded focus:border-[#9de5dc]/30 outline-none transition-colors text-[#9de5dc]"
          value={selectedChapterId}
          disabled={loadingScenes || chapterOptions.length === 0}
          onChange={(e) => onChapterIdChange(e.target.value)}
          aria-label="Chapter selector"
        >
          {loadingScenes && <option value="">Loading...</option>}
          {!loadingScenes &&
            chapterOptions.map((cid) => (
              <option key={cid} value={cid}>
                CHAPTER {cid}
              </option>
            ))}
          {!loadingScenes && chapterOptions.length === 0 && <option value="">No chapters</option>}
        </select>
        <button
          type="button"
          className="rounded border border-[#2f5b58] bg-[#133a37]/50 px-3 py-1.5 text-xs font-bold text-[#9de5dc] hover:bg-[#133a37] transition-all"
          onClick={() => onCreateNewChapter()}
        >
          + CHAPTER
        </button>
        <Link href={`/read/${storySlug}/${selectedChapterId || "ch01"}`} className="shell-link px-3 py-1.5 text-xs font-bold uppercase tracking-widest bg-white/5 rounded border border-white/10 hover:bg-white/10 transition">
          PROSE VIEW
        </Link>
        {viewMode === "chapter" && selectedChapterId && (
          <button
            type="button"
            className="rounded bg-[#9de5dc] px-3 py-1.5 text-xs font-bold text-[#0a0a0a] hover:bg-[#b0f0e8] transition-all shadow-[0_0_10px_rgba(157,229,220,0.3)]"
            onClick={onOpenAutoWrite}
          >
            AUTO WRITE
          </button>
        )}
      </div>
    </div>
  );
}

type SceneBodyProps = {
  scene: SceneItem | null;
  current: CurrentVersion | null;
  loadingDetail: boolean;
  error: string | null;
  seedPrompt: string;
  onCommitted: () => Promise<void>;
  onGhostSuggestionReadyChange: (value: boolean) => void;
  // New view mode props
  viewMode: "scene" | "chapter";
  chapterScenes: any[];
  loadingChapter: boolean;
  selectedChapterId: string;
  pendingChapterProse: { id: string; prose: string } | null;
  stagingData: { user_prose: string; llm_prose: string; status: string } | null;
  onSaveChapterDraft: (prose: string) => Promise<void>;
  onResplitChapter: (prose: string) => Promise<void>;
  v3Draft: { full_text: string; status: string; virtual_scenes: any[] } | null;
};

function SceneBody({
  scene,
  current,
  loadingDetail,
  error,
  seedPrompt,
  onCommitted,
  onGhostSuggestionReadyChange,
  viewMode,
  chapterScenes,
  loadingChapter,
  selectedChapterId,
  pendingChapterProse,
  stagingData,
  onSaveChapterDraft,
  onResplitChapter,
  v3Draft,
}: SceneBodyProps) {
  if (error) return <div className="p-4 text-sm text-[#ff8f8f]">{error}</div>;

  if (viewMode === "chapter") {
    if (loadingChapter) return <div className="p-4 muted text-sm animate-pulse">Loading chapter content...</div>;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar bg-[#0a0a0a]">
        <ChapterReader
          chapterId={selectedChapterId}
          items={chapterScenes}
          pendingProse={pendingChapterProse}
          stagingData={stagingData}
          onSave={onSaveChapterDraft}
          onResplit={onResplitChapter}
          v3Draft={v3Draft}
        />
      </div>
    );
  }

  return (
    <>
      {loadingDetail ? <div className="p-4 muted text-sm">Loading scene detail...</div> : null}
      {!loadingDetail && scene ? (
        <div className="min-h-0 flex-1">
          <DraftRunner
            sceneId={String(scene.id)}
            sceneStatus={scene.status}
            workunitId={scene.workunit_id ?? undefined}
            currentVersionId={current?.id ?? null}
            currentVersionNo={current?.version_no ?? null}
            initialText={current?.text_content ?? ""}
            seedPrompt={seedPrompt}
            onCommitted={onCommitted}
            onGhostSuggestionReadyChange={onGhostSuggestionReadyChange}
          />
        </div>
      ) : (
        !loadingDetail && <div className="p-4 muted text-sm">Select a scene or chapter to begin.</div>
      )}
    </>
  );
}

export default function WriteTabCenterPanel(props: WriteTabCenterPanelProps) {
  return (
    <div className="flex h-[calc(100svh-9rem)] min-h-[680px] min-w-0 flex-col gap-2">
      <SceneHeader
        storySlug={props.storySlug}
        scenes={props.scenes}
        chapterIds={props.chapterIds}
        sceneId={props.sceneId}
        loadingScenes={props.loadingScenes}
        scene={props.scene}
        onSceneIdChange={props.onSceneIdChange}
        selectedChapterId={props.selectedChapterId}
        onChapterIdChange={props.onChapterIdChange}
        onCreateNewChapter={props.onCreateNewChapter}
        onUnlockScene={props.onUnlockScene}
        onOpenAutoWrite={() => props.setShowAutoWrite(true)}
        viewMode={props.viewMode}
      />
      <SceneBody
        scene={props.scene}
        current={props.current}
        loadingDetail={props.loadingDetail}
        error={props.error}
        seedPrompt={props.seedPrompt}
        onCommitted={props.onCommitted}
        onGhostSuggestionReadyChange={props.onGhostSuggestionReadyChange}
        viewMode={props.viewMode}
        chapterScenes={props.chapterScenes}
        loadingChapter={props.loadingChapter}
        selectedChapterId={props.selectedChapterId}
        pendingChapterProse={props.pendingChapterProse}
        stagingData={props.stagingData}
        onSaveChapterDraft={props.onSaveChapterDraft}
        onResplitChapter={props.onResplitChapter}
        v3Draft={props.v3Draft ?? null}
      />
      {props.showAutoWrite && props.selectedChapterId && (
        <AutoWriteWizard
          storySlug={props.storySlug}
          chapterId={props.selectedChapterId}
          onComplete={props.onAutoWriteComplete}
          onClose={() => props.setShowAutoWrite(false)}
        />
      )}
    </div>
  );
}
