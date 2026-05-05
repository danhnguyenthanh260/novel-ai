import { useMemo, useState } from "react";
import { useStory } from "@/features/story/StoryContext";
import AutoWriteWizard from "@/features/scenes/components/writeTab/AutoWriteWizard";
import ArtifactSurface from "@/features/scenes/components/writeTab/ArtifactSurface";
import CommandWorkStream from "@/features/scenes/components/writeTab/CommandWorkStream";
import type {
  ChapterSceneItem,
  ContextReadiness,
  CurrentVersion,
  SceneItem,
} from "@/features/scenes/components/writeTab/types";

type DraftSource = {
  key: string;
  text: string;
};

type NovelLabWorkspaceProps = {
  storySlug: string;
  chapterIds: string[];
  scene: SceneItem | null;
  current: CurrentVersion | null;
  loadingScenes: boolean;
  loadingDetail: boolean;
  error: string | null;
  selectedChapterId: string;
  onChapterIdChange: (id: string) => void;
  chapterScenes: ChapterSceneItem[];
  loadingChapter: boolean;
  onCreateNewChapter: () => Promise<void>;
  showAutoWrite: boolean;
  setShowAutoWrite: (value: boolean) => void;
  pendingChapterProse: { id: string; prose: string } | null;
  stagingData: { user_prose: string; llm_prose: string; status: string } | null;
  v3Draft: { full_text: string; status: string; virtual_scenes: unknown[] } | null;
  onAutoWriteComplete: (prose: string) => Promise<void>;
  onSaveChapterDraft: (prose: string) => Promise<void>;
};

function getChapterTitle(chapterId: string): string {
  return chapterId ? `Chapter ${chapterId}` : "No chapter selected";
}

function storyLabelFromSlug(storySlug: string): string {
  return storySlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || "Current story";
}

function buildDraftSource(props: NovelLabWorkspaceProps): DraftSource {
  if (props.pendingChapterProse?.id === props.selectedChapterId) {
    return { key: `pending-${props.selectedChapterId}`, text: props.pendingChapterProse.prose };
  }
  if (props.stagingData?.user_prose) return { key: `staging-user-${props.selectedChapterId}`, text: props.stagingData.user_prose };
  if (props.v3Draft?.full_text) return { key: `v3-${props.selectedChapterId}`, text: props.v3Draft.full_text };

  const sceneText = props.chapterScenes.map((item) => item.text_content).filter(Boolean).join("\n\n");
  if (sceneText) return { key: `scenes-${props.selectedChapterId}-${props.chapterScenes.length}`, text: sceneText };
  if (props.current?.text_content) return { key: `scene-${props.current.id}`, text: props.current.text_content };

  return {
    key: `empty-${props.selectedChapterId || "none"}`,
    text: "",
  };
}

function NavigationPanel(
  props: Pick<NovelLabWorkspaceProps, "storySlug" | "chapterIds" | "loadingScenes" | "selectedChapterId" | "onChapterIdChange" | "onCreateNewChapter">
) {
  const visibleChapters = props.chapterIds.length ? props.chapterIds : [props.selectedChapterId].filter(Boolean);
  const storyLabel = storyLabelFromSlug(props.storySlug);

  return (
    <aside className="novel-lab-nav" aria-label="Story navigation">
      <div className="novel-lab-story-card">
        <div className="novel-lab-cover" aria-hidden />
        <div>
          <div className="text-sm font-semibold">{storyLabel}</div>
          <div className="muted text-xs">{props.chapterIds.length ? `${props.chapterIds.length} chapters` : "No chapters loaded"}</div>
          <div className="mt-2 text-xs text-[var(--accent)]">{props.selectedChapterId || "No chapter"}</div>
        </div>
      </div>

      <nav className="space-y-1 text-sm" aria-label="Workspace views">
        {["Shelf", "Write", "Artifacts", "Memory", "Reviews", "Reader", "Publish"].map((item) => (
          <div key={item} className={`novel-lab-nav-row ${item === "Write" ? "novel-lab-nav-row--active" : ""}`}>
            <span aria-hidden>{item.slice(0, 1)}</span>
            <span>{item}</span>
          </div>
        ))}
      </nav>

      <div className="space-y-2">
        <div className="muted text-xs uppercase tracking-wide">Chapters</div>
        {props.loadingScenes ? <div className="muted text-xs">Loading chapters...</div> : null}
        {visibleChapters.length ? (
          visibleChapters.map((chapterId) => (
            <button
              key={chapterId}
              type="button"
              className={`novel-lab-chapter-row ${chapterId === props.selectedChapterId ? "novel-lab-chapter-row--selected" : ""}`}
              onClick={() => props.onChapterIdChange(chapterId)}
            >
              <span>{getChapterTitle(chapterId)}</span>
              <span>{chapterId === props.selectedChapterId ? "Drafting" : "Not started"}</span>
            </button>
          ))
        ) : (
          <div className="quiet-empty-state p-3 text-xs">No chapters yet.</div>
        )}
        <button type="button" className="shell-link w-full px-3 py-2 text-xs" onClick={() => void props.onCreateNewChapter()}>
          New chapter
        </button>
      </div>

      <details className="novel-lab-operations">
        <summary>Operations</summary>
        <div className="mt-2 space-y-1">
          {["Pipeline", "Settings"].map((item) => (
            <div key={item} className="novel-lab-nav-row novel-lab-nav-row--secondary">
              <span aria-hidden>{item.slice(0, 1)}</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </details>
    </aside>
  );
}

export default function NovelLabWorkspace(props: NovelLabWorkspaceProps) {
  const { isArtifactVisible } = useStory();
  const [continuityQueued, setContinuityQueued] = useState(false);
  const [composerValue, setComposerValue] = useState(props.selectedChapterId ? `/write chapter ${props.selectedChapterId} ` : "");
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const draftSource = useMemo(() => buildDraftSource(props), [props]);
  const chapterTitle = props.selectedChapterId ? `${getChapterTitle(props.selectedChapterId)} Draft` : "No chapter selected";
  const readiness: ContextReadiness = "degraded";

  return (
    <>
      <main
        className="novel-lab-workspace"
        style={{
          gridTemplateColumns: `236px 1fr ${isArtifactVisible ? "minmax(520px, 1.18fr)" : "320px"}`,
        }}
      >
        <NavigationPanel
          storySlug={props.storySlug}
          chapterIds={props.chapterIds}
          loadingScenes={props.loadingScenes}
          selectedChapterId={props.selectedChapterId}
          onChapterIdChange={props.onChapterIdChange}
          onCreateNewChapter={props.onCreateNewChapter}
        />
        <CommandWorkStream
          chapterId={props.selectedChapterId}
          hasDraft={draftSource.text.trim().length > 0}
          continuityQueued={continuityQueued}
          composerValue={composerValue}
          commandMenuOpen={commandMenuOpen}
          onComposerValueChange={setComposerValue}
          onCommandMenuOpenChange={setCommandMenuOpen}
          onOpenAutoWrite={() => props.setShowAutoWrite(true)}
          onQueueContinuity={() => setContinuityQueued(true)}
        />
        <ArtifactSurface
          storySlug={props.storySlug}
          chapterId={props.selectedChapterId}
          chapterTitle={chapterTitle}
          draftKey={draftSource.key}
          draftText={draftSource.text}
          hasChapter={Boolean(props.selectedChapterId)}
          readiness={readiness}
          isVisible={isArtifactVisible}
          continuityQueued={continuityQueued}
          onOpenAutoWrite={() => props.setShowAutoWrite(true)}
          onQueueContinuity={() => setContinuityQueued(true)}
          onSaveDraft={props.onSaveChapterDraft}
        />
      </main>

      {props.error ? <div className="mx-2 mt-2 rounded border border-[var(--danger)]/40 p-3 text-sm text-[var(--danger)]">{props.error}</div> : null}
      {props.loadingDetail || props.loadingChapter ? <div className="mx-2 mt-2 muted text-xs">Loading current chapter artifact...</div> : null}
      {props.showAutoWrite && props.selectedChapterId ? (
        <AutoWriteWizard
          storySlug={props.storySlug}
          chapterId={props.selectedChapterId}
          onComplete={props.onAutoWriteComplete}
          onClose={() => props.setShowAutoWrite(false)}
        />
      ) : null}
    </>
  );
}
