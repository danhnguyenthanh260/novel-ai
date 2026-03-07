"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";

type PanelMode = "pinned" | "auto" | "hidden";

type TriPanelLayoutProps = {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  leftMode?: PanelMode;
  rightMode?: PanelMode;
  leftTitle?: string;
  centerTitle?: string;
  rightTitle?: string;
  leftTabletWidthClass?: string;
  rightTabletWidthClass?: string;
  leftDesktopWidthClass?: string;
  rightDesktopWidthClass?: string;
};

export default function TriPanelLayout({
  left,
  center,
  right,
  leftMode = "auto",
  rightMode = "pinned",
  leftTitle = "Navigator",
  centerTitle = "Main",
  rightTitle = "Inspector",
  leftTabletWidthClass = "w-64 min-w-64",
  rightTabletWidthClass = "w-80 min-w-80",
  leftDesktopWidthClass = "w-64 min-w-64",
  rightDesktopWidthClass = "w-80 min-w-80",
}: TriPanelLayoutProps) {
  const [mobileTab, setMobileTab] = useState<"left" | "center" | "right">("center");
  const [tabletLeftOpen, setTabletLeftOpen] = useState(false);
  const [viewportMode, setViewportMode] = useState<"mobile" | "tablet" | "desktop">("desktop");

  const hasLeft = Boolean(left);
  const hasRight = Boolean(right);
  const showRight = hasRight && rightMode !== "hidden";
  const showLeftDesktop = hasLeft && leftMode !== "hidden";

  const mobileTabs = useMemo(() => {
    const tabs: Array<{ key: "left" | "center" | "right"; label: string; enabled: boolean }> = [
      { key: "left", label: leftTitle, enabled: hasLeft },
      { key: "center", label: centerTitle, enabled: true },
      { key: "right", label: rightTitle, enabled: hasRight },
    ];
    return tabs.filter((t) => t.enabled);
  }, [centerTitle, hasLeft, hasRight, leftTitle, rightTitle]);

  useEffect(() => {
    const resolveMode = () => {
      const width = window.innerWidth;
      if (width >= 1280) {
        setViewportMode("desktop");
        return;
      }
      if (width >= 768) {
        setViewportMode("tablet");
        return;
      }
      setViewportMode("mobile");
    };
    resolveMode();
    window.addEventListener("resize", resolveMode);
    return () => window.removeEventListener("resize", resolveMode);
  }, []);

  return (
    <div className="space-y-2">
      {viewportMode === "mobile" ? (
        <>
          <div className="flex items-center gap-2">
            {mobileTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`shell-link px-2 py-1 text-xs ${mobileTab === tab.key ? "border-[#3f6b90]" : ""}`}
                onClick={() => setMobileTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div>
            {mobileTab === "left" && hasLeft ? left : null}
            {mobileTab === "center" ? center : null}
            {mobileTab === "right" && hasRight ? right : null}
          </div>
        </>
      ) : null}

      {viewportMode === "tablet" ? (
        <>
          <div className="flex items-center gap-2">
            {hasLeft ? (
              <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => setTabletLeftOpen((v) => !v)}>
                {tabletLeftOpen ? `Hide ${leftTitle}` : `Show ${leftTitle}`}
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 gap-3">
            {tabletLeftOpen && hasLeft ? <aside className={leftTabletWidthClass}>{left}</aside> : null}
            <section className="min-w-0 flex-1">{center}</section>
            {showRight ? <aside className={rightTabletWidthClass}>{right}</aside> : null}
          </div>
        </>
      ) : null}

      {viewportMode === "desktop" ? (
        <div className="flex min-w-0 gap-3">
          {showLeftDesktop ? <aside className={leftDesktopWidthClass}>{left}</aside> : null}
          <section className="min-w-0 flex-1">{center}</section>
          {showRight ? <aside className={rightDesktopWidthClass}>{right}</aside> : null}
        </div>
      ) : null}
    </div>
  );
}
