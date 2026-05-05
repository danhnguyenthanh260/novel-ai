"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StoryProvider, useStory } from "@/features/story/StoryContext";
import StorySelector from "@/features/story/StorySelector";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoryProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header__inner">
            <Link href="/" className="brand-mark text-sm" aria-label="Novel Lab home">
              <span>Novel</span>
              <span>Lab</span>
            </Link>
            <CompactContextBar />
            <div className="flex items-center gap-3">
              <PipelineToggle />
              <StorySelector />
            </div>
          </div>
        </header>
        <div className="app-body">{children}</div>
      </div>
    </StoryProvider>
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
  const { headerContext, isArtifactVisible } = useStory();
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
      <span className="text-[11px] font-medium">Pipeline</span>
    </button>
  );
}
