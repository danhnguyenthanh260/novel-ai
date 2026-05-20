import Link from "next/link";
import { useMemo, useState } from "react";
import NextActionRail from "@/features/pipeline/components/NextActionRail";
import { useStory } from "@/features/story/StoryContext";
import AutoWriteWizard from "@/features/scenes/components/writeTab/AutoWriteWizard";
import ArtifactSurface from "@/features/scenes/components/writeTab/ArtifactSurface";
import CommandWorkStream from "@/features/scenes/components/writeTab/CommandWorkStream";
import type {
  AnalysisSnapshot,
  AssistantAvailability,
  ChatScope,
  ChapterSceneItem,
  ContextReadiness,
  CurrentVersion,
  MemorySnapshot,
  PipelineSnapshot,
  SceneItem,
  WriteInspectorMode,
} from "@/features/scenes/components/writeTab/types";

type DraftSource = {
  key: string;
  text: string;
};

type NovelLabWorkspaceProps = {
  storySlug: string;
  chatScope: ChatScope;
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

function pendingDraftSource(props: NovelLabWorkspaceProps): DraftSource | null {
  if (props.pendingChapterProse?.id !== props.selectedChapterId) return null;
  return { key: `pending-${props.selectedChapterId}`, text: props.pendingChapterProse.prose };
}

function savedDraftSource(props: NovelLabWorkspaceProps): DraftSource | null {
  if (props.stagingData?.user_prose) return { key: `staging-user-${props.selectedChapterId}`, text: props.stagingData.user_prose };
  if (props.v3Draft?.full_text) return { key: `v3-${props.selectedChapterId}`, text: props.v3Draft.full_text };
  if (props.stagingData?.llm_prose) return { key: `staging-llm-${props.selectedChapterId}`, text: props.stagingData.llm_prose };
  return null;
}

function sceneDraftSource(props: NovelLabWorkspaceProps): DraftSource | null {
  const sceneText = props.chapterScenes.map((item) => item.text_content).filter(Boolean).join("\n\n");
  if (sceneText) return { key: `scenes-${props.selectedChapterId}-${props.chapterScenes.length}`, text: sceneText };
  if (props.current?.text_content) return { key: `scene-${props.current.id}`, text: props.current.text_content };
  return null;
}

function buildDraftSource(props: NovelLabWorkspaceProps): DraftSource {
  const draftSource = pendingDraftSource(props) ?? savedDraftSource(props) ?? sceneDraftSource(props);
  if (draftSource) return draftSource;

  return {
    key: `empty-${props.selectedChapterId || "none"}`,
    text: "",
  };
}

// Navigation owns route links, chapter selection, artifact visibility, and chat scope controls in one compact rail.
// eslint-disable-next-line complexity
function NavigationPanel(
  props: Pick<NovelLabWorkspaceProps, "storySlug" | "chapterIds" | "loadingScenes" | "selectedChapterId" | "onChapterIdChange" | "onCreateNewChapter"> & {
    hasDraft: boolean;
    loadingWorkspace: boolean;
    continuityQueued: boolean;
    readiness: ContextReadiness;
    chatScope: ChatScope;
    onChatScopeChange: (scope: ChatScope) => void;
    onOpenArtifactDrawer: () => void;
  }
) {
  const { isArtifactVisible, setIsArtifactVisible } = useStory();
  const visibleChapters = props.chapterIds.length ? props.chapterIds : [props.selectedChapterId].filter(Boolean);
  const storyLabel = storyLabelFromSlug(props.storySlug);
  const storyBase = `/stories/${encodeURIComponent(props.storySlug)}`;
  const readerHref = props.selectedChapterId && props.hasDraft ? `/read/${encodeURIComponent(props.storySlug)}/${encodeURIComponent(props.selectedChapterId)}` : null;
  const workspaceLinks = [
    { label: "Shelf", href: "/shelf" },
    { label: "Write", href: `${storyBase}/write`, active: true },
    { label: "Memory", href: `${storyBase}/memory` },
    { label: "Reviews", href: `${storyBase}/reviews` },
    ...(readerHref ? [{ label: "Reader", href: readerHref }] : []),
  ];
  const operationLinks = [
    { label: "Pipeline", href: `${storyBase}/pipelines` },
    { label: "Settings", href: `${storyBase}/settings` },
  ];

  return (
    <aside className="novel-lab-nav" aria-label="Story navigation">
      <div className="novel-lab-nav__fixed">
        <div className="novel-lab-story-card">
          <div className="novel-lab-cover" aria-hidden />
          <div>
            <div className="text-sm font-semibold">{storyLabel}</div>
            <div className="muted text-xs">{props.chapterIds.length ? `${props.chapterIds.length} chapters` : "No chapters loaded"}</div>
            <div className="mt-2 text-xs text-[var(--accent)]">{props.selectedChapterId || "No chapter"}</div>
          </div>
        </div>

        <NextActionRail
          storySlug={props.storySlug}
          hasChapter={Boolean(props.selectedChapterId || props.chapterIds.length)}
          hasDraft={props.hasDraft}
          continuityQueued={props.continuityQueued}
          readiness={props.readiness}
          loading={props.loadingWorkspace}
        />
        <div className="chat-scope-toggle" role="group" aria-label="Chat scope">
          <button type="button" className={props.chatScope === "story" ? "is-active" : ""} onClick={() => props.onChatScopeChange("story")}>
            Story
          </button>
          <button type="button" className={props.chatScope === "chapter" ? "is-active" : ""} onClick={() => props.onChatScopeChange("chapter")}>
            Chapter
          </button>
        </div>
      </div>

      <div className="novel-lab-nav__scroll">
        <nav className="space-y-1 text-sm" aria-label="Workspace views">
          {workspaceLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`novel-lab-nav-row no-underline hover:bg-white/[0.04] ${item.active ? "novel-lab-nav-row--active" : ""}`}
            >
              <span aria-hidden>{item.label.slice(0, 1)}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className={`novel-lab-nav-row border-0 bg-transparent text-left hover:bg-white/[0.04] ${
              isArtifactVisible ? "novel-lab-nav-row--active" : ""
            }`}
            aria-pressed={isArtifactVisible}
            onClick={() => {
              setIsArtifactVisible(!isArtifactVisible);
              props.onOpenArtifactDrawer();
            }}
          >
            <span aria-hidden>A</span>
            <span>Artifacts</span>
          </button>
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
            {operationLinks.map((item) => (
              <Link key={item.label} href={item.href} className="novel-lab-nav-row novel-lab-nav-row--secondary no-underline hover:bg-white/[0.04]">
                <span aria-hidden>{item.label.slice(0, 1)}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </details>
      </div>
    </aside>
  );
}

function workspaceColumns(isArtifactVisible: boolean): string {
  return `236px 1fr ${isArtifactVisible ? "minmax(520px, 1.18fr)" : "320px"}`;
}

function selectedChapterTitle(selectedChapterId: string): string {
  return selectedChapterId ? `${getChapterTitle(selectedChapterId)} Draft` : "No chapter selected";
}

function assistantAvailability(props: NovelLabWorkspaceProps, hasDraft: boolean): AssistantAvailability {
  const hasSourceChapters = props.chapterScenes.length > 0 || Boolean(props.current?.text_content || props.stagingData?.llm_prose || props.v3Draft?.full_text);
  const hasMemorySnapshot = Boolean(props.v3Draft?.virtual_scenes?.length || props.stagingData || hasDraft);
  return {
    has_source_chapters: hasSourceChapters,
    has_active_characters: hasSourceChapters,
    has_memory_snapshot: hasMemorySnapshot,
    has_style_profile: hasMemorySnapshot || hasSourceChapters,
    has_chapter_intent: false,
    has_immediate_continuity: hasDraft,
  };
}

function WorkspaceStatusMessages({ error, loadingDetail, loadingChapter }: Pick<NovelLabWorkspaceProps, "error" | "loadingDetail" | "loadingChapter">) {
  return (
    <>
      {error ? <div className="mx-2 mt-2 rounded border border-[var(--danger)]/40 p-3 text-sm text-[var(--danger)]">{error}</div> : null}
      {loadingDetail || loadingChapter ? <div className="mx-2 mt-2 muted text-xs">Loading current chapter artifact...</div> : null}
    </>
  );
}

function WorkspaceAutoWriteModal(
  props: Pick<NovelLabWorkspaceProps, "storySlug" | "selectedChapterId" | "showAutoWrite" | "onAutoWriteComplete" | "setShowAutoWrite">
) {
  if (!props.showAutoWrite || !props.selectedChapterId) return null;
  return (
    <AutoWriteWizard
      storySlug={props.storySlug}
      chapterId={props.selectedChapterId}
      onComplete={props.onAutoWriteComplete}
      onClose={() => props.setShowAutoWrite(false)}
    />
  );
}

export default function NovelLabWorkspace(props: NovelLabWorkspaceProps) {
  const { isArtifactVisible, setIsArtifactVisible } = useStory();
  const [activeChatScope, setActiveChatScope] = useState<ChatScope>(props.chatScope);
  const [continuityQueued, setContinuityQueued] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<WriteInspectorMode>("progress");
  const [artifactDrawerOpen, setArtifactDrawerOpen] = useState(false);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [memorySnapshot, setMemorySnapshot] = useState<MemorySnapshot | null>(null);
  const [pipelineSnapshot, setPipelineSnapshot] = useState<PipelineSnapshot | null>(null);
  const draftSource = useMemo(() => buildDraftSource(props), [props]);
  const chapterTitle = selectedChapterTitle(props.selectedChapterId);
  const hasDraft = draftSource.text.trim().length > 0;
  const loadingWorkspace = props.loadingScenes || props.loadingDetail || props.loadingChapter;
  const readiness: ContextReadiness = "degraded";
  const availability = assistantAvailability(props, hasDraft);
  const scopedChapterId = activeChatScope === "story" ? "" : props.selectedChapterId;
  const scopedChapterTitle = activeChatScope === "story" ? "Story scope" : chapterTitle;
  const openInspectorMode = (mode: WriteInspectorMode) => {
    setInspectorMode(mode);
    setIsArtifactVisible(false);
    setArtifactDrawerOpen(true);
  };

  return (
    <>
      <main
        className="novel-lab-workspace"
        style={{
          gridTemplateColumns: workspaceColumns(isArtifactVisible),
        }}
      >
        <NavigationPanel
          storySlug={props.storySlug}
          chapterIds={props.chapterIds}
          loadingScenes={props.loadingScenes}
          selectedChapterId={props.selectedChapterId}
          onChapterIdChange={props.onChapterIdChange}
          onCreateNewChapter={props.onCreateNewChapter}
          hasDraft={hasDraft}
          loadingWorkspace={loadingWorkspace}
          continuityQueued={continuityQueued}
          readiness={readiness}
          chatScope={activeChatScope}
          onChatScopeChange={setActiveChatScope}
          onOpenArtifactDrawer={() => setArtifactDrawerOpen(true)}
        />
        <CommandWorkStream
          storySlug={props.storySlug}
          chapterId={scopedChapterId}
          chatScope={activeChatScope}
          hasDraft={hasDraft}
          continuityQueued={continuityQueued}
          composerValue={composerValue}
          commandMenuOpen={commandMenuOpen}
          onComposerValueChange={setComposerValue}
          onCommandMenuOpenChange={setCommandMenuOpen}
          onOpenAutoWrite={() => props.setShowAutoWrite(true)}
          onOpenArtifactDrawer={() => setArtifactDrawerOpen(true)}
          onQueueContinuity={() => setContinuityQueued(true)}
          onInspectorModeChange={openInspectorMode}
          onAnalysisSnapshotChange={setAnalysisSnapshot}
          onMemorySnapshotChange={setMemorySnapshot}
          onPipelineSnapshotChange={setPipelineSnapshot}
          assistantContext={{
            storyTitle: storyLabelFromSlug(props.storySlug),
            storySelected: Boolean(props.storySlug),
            chapterId: scopedChapterId || null,
            chapterTitle: scopedChapterTitle,
            readiness,
            availability,
          }}
        />
        <ArtifactSurface
          storySlug={props.storySlug}
          chapterId={props.selectedChapterId}
          chapterTitle={chapterTitle}
          currentVersionNo={props.current?.version_no ?? null}
          currentVersionKind={props.current?.kind ?? null}
          draftKey={draftSource.key}
          draftText={draftSource.text}
          hasChapter={Boolean(props.selectedChapterId)}
          readiness={readiness}
          isVisible={isArtifactVisible}
          inspectorMode={inspectorMode}
          analysisSnapshot={analysisSnapshot}
          memorySnapshot={memorySnapshot}
          pipelineSnapshot={pipelineSnapshot}
          onInspectorModeChange={setInspectorMode}
          drawerOpen={artifactDrawerOpen}
          onDrawerOpenChange={setArtifactDrawerOpen}
          continuityQueued={continuityQueued}
          onOpenAutoWrite={() => props.setShowAutoWrite(true)}
          onQueueContinuity={() => setContinuityQueued(true)}
          onSaveDraft={props.onSaveChapterDraft}
        />
      </main>

      <WorkspaceStatusMessages error={props.error} loadingDetail={props.loadingDetail} loadingChapter={props.loadingChapter} />
      <WorkspaceAutoWriteModal
        storySlug={props.storySlug}
        selectedChapterId={props.selectedChapterId}
        showAutoWrite={props.showAutoWrite}
        onAutoWriteComplete={props.onAutoWriteComplete}
        setShowAutoWrite={props.setShowAutoWrite}
      />
    </>
  );
}
