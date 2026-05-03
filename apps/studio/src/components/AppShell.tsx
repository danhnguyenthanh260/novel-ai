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
            <StorySelector />
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
      <span className="status-pill status-pill--partial">Context Partial</span>
      <span className="status-pill status-pill--other">Worker Idle</span>
      <span className="status-pill status-pill--other">Draft Saved</span>
    </div>
  );
}
