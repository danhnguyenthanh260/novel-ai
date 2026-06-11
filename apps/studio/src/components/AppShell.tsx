"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StoryProvider, useStory } from "@/features/story/StoryContext";
import StorySelector from "@/features/story/StorySelector";
import CommandPalette from "@/components/CommandPalette";
import AssistantDock from "@/components/AssistantDock";
import { Button } from "@/components/ui/button";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWriteRoute = pathname.includes("/write") || pathname === "/";
  useEffect(() => {
    document.documentElement.classList.toggle("write-route-lock", isWriteRoute);
    document.body.classList.toggle("write-route-lock", isWriteRoute);
    return () => {
      document.documentElement.classList.remove("write-route-lock");
      document.body.classList.remove("write-route-lock");
    };
  }, [isWriteRoute]);

  return (
    <StoryProvider>
      <ShellChrome isWriteRoute={isWriteRoute}>{children}</ShellChrome>
    </StoryProvider>
  );
}

function ShellChrome({ children, isWriteRoute }: { children: ReactNode; isWriteRoute: boolean }) {
  const pathname = usePathname();
  const { storySlug } = useStory();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const routeStorySlug = (() => {
    const fromStories = pathname.match(/^\/stories\/([^/]+)/);
    if (fromStories?.[1]) return decodeURIComponent(fromStories[1]);
    const fromRead = pathname.match(/^\/read\/([^/]+)/);
    if (fromRead?.[1]) return decodeURIComponent(fromRead[1]);
    return null;
  })();
  const selectedSlug = routeStorySlug ?? (storySlug.trim() ? storySlug : null);

  return (
    <div className={isWriteRoute ? "app-shell app-shell--write" : "app-shell"}>
      <header className="app-header">
        <div className="app-header__inner">
          <Link href="/" className="brand-mark text-sm" aria-label="Novel Lab home">
            <span>Novel</span>
            <span>Lab</span>
          </Link>
          <CompactContextBar />
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] text-muted-foreground"
              onClick={() => setPaletteOpen(true)}
            >
              Search
              <span className="rounded border border-border px-1 text-[10px]">Ctrl K</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] text-muted-foreground"
              onClick={() => setAssistantOpen(true)}
            >
              Assistant
            </Button>
            <PipelineToggle />
            <StorySelector />
          </div>
        </div>
      </header>
      <div className="app-body">{children}</div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        selectedSlug={selectedSlug}
        onOpenAssistant={() => setAssistantOpen(true)}
      />
      <AssistantDock
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        selectedSlug={selectedSlug}
      />
    </div>
  );
}

function routeLabel(pathname: string): string {
  if (pathname.includes("/reviews")) return "Reviews";
  if (pathname.includes("/memory")) return "Memory";
  if (pathname.includes("/read")) return "Reader";
  if (pathname.includes("/publish")) return "Publish";
  if (pathname.includes("/ingest")) return "Ingest";
  if (pathname.includes("/analysis")) return "Analysis";
  if (pathname.includes("/map")) return "Map";
  if (pathname.includes("/write") || pathname === "/") return "Write";
  return "Studio";
}

function CompactContextBar() {
  const pathname = usePathname();
  const { headerContext } = useStory();
  const areaLabel = routeLabel(pathname);
  const chapter = headerContext.chapterLabel ?? "No chapter";

  return (
    <div className="app-context-bar" aria-label="Workspace context">
      <span className="app-context-bar__crumb">Novel Lab</span>
      <span className="app-context-bar__slash">/</span>
      <span>{areaLabel}</span>
      <span className="app-context-bar__slash">/</span>
      <span>{chapter}</span>
      <span className="muted text-[10px] uppercase tracking-wider ml-4">Worker Idle</span>
      <span className="muted text-[10px] uppercase tracking-wider ml-2">Draft Saved</span>
    </div>
  );
}

function PipelineToggle() {
  const { isArtifactVisible, setIsArtifactVisible } = useStory();
  const pathname = usePathname();

  if (!pathname.includes("/write") && pathname !== "/") return null;

  return (
    <button
      onClick={() => setIsArtifactVisible(!isArtifactVisible)}
      title="Toggle Pipeline"
      className={`transition-all hover:text-[var(--accent)] flex items-center gap-1 ${
        isArtifactVisible ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="text-[11px] font-medium">Pipeline</span>
    </button>
  );
}
