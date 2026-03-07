"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStory } from "@/features/story/StoryContext";
import { apiBase } from "@/lib/apiBase";

type SceneItem = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
  workunit_id: string | null;
};

export default function ScenesPageClient() {
  const { storySlug } = useStory();
  const [items, setItems] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listUrl = useMemo(() => `${apiBase(storySlug)}/scenes`, [storySlug]);

  useEffect(() => {
    let dead = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(listUrl, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `GET_SCENES_FAILED_${res.status}`);
        if (!dead) setItems(Array.isArray(json?.items) ? json.items : []);
      } catch (e: unknown) {
        if (!dead) {
          setItems([]);
          setError(e instanceof Error ? e.message : "GET_SCENES_FAILED");
        }
      } finally {
        if (!dead) setLoading(false);
      }
    };
    run();
    return () => {
      dead = true;
    };
  }, [listUrl]);

  return (
    <main className="space-y-4 p-2 md:p-4">
      <div className="surface-card flex items-center justify-between p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scene Board</h1>
          <div className="muted text-sm">Linear writing surface for active story</div>
        </div>
        <div className="rounded-lg border border-[#2f5b58] bg-[#133a37] px-3 py-1 text-sm text-[#9de5dc]">story: {storySlug}</div>
      </div>

      {loading && <div className="muted text-sm">Loading scenes...</div>}
      {!loading && error && <div className="text-sm text-[#ff8f8f]">{error}</div>}

      {!loading && !error && (
        <div className="grid gap-3">
          {items.map((scene) => (
            <Link
              key={scene.id}
              href={`/stories/${storySlug}/write?scene_id=${scene.id}`}
              className="surface-card block p-3 transition hover:-translate-y-0.5 hover:border-[#34506d]"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">
                  {scene.chapter_id} / #{scene.idx} {scene.title ? `- ${scene.title}` : ""}
                </div>
                <span
                  className={`status-pill ${
                    scene.status === "LOCKED"
                      ? "status-pill--locked"
                      : scene.status === "DRAFTING"
                        ? "status-pill--drafting"
                        : "status-pill--other"
                  }`}
                >
                  {scene.status}
                </span>
              </div>
              <div className="muted flex flex-wrap gap-3 text-sm">
                <span>scene_id: {scene.id}</span>
                <span>workunit: {scene.workunit_id ?? "-"}</span>
              </div>
            </Link>
          ))}
          {items.length === 0 && <div className="muted text-sm">No scenes.</div>}
        </div>
      )}
    </main>
  );
}
