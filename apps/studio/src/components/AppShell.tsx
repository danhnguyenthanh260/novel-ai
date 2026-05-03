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
      className={`text-xs transition-all hover:text-[var(--accent)] ${
        isArtifactVisible ? "text-[var(--accent)] font-semibold" : "text-[var(--text-secondary)]"
      }`}
    >
      Pipeline
    </button>
  );
}
