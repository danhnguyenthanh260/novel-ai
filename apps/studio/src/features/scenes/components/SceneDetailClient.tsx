"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useStory } from "@/features/story/StoryContext";
import { apiBase } from "@/lib/apiBase";
import DraftRunner from "@/features/scenes/components/DraftRunner";

type SceneRow = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
};

type CurrentVersion = {
  id: number;
  version_no: number;
  kind: string;
  summary: string | null;
  text_content: string | null;
};

function buildSeedPrompt(scene: SceneRow): string {
  return (
    `Write scene for chapter=${scene.chapter_id}, idx=${scene.idx}.\n` +
    "Constraints: third-person limited, grim sci-fi, tight pacing.\n" +
    "If lore is missing, add [TODO: Question] at end.\n"
  );
}

function buildWorkunitId(scene: SceneRow): string | undefined {
  return scene.chapter_id ? `${scene.chapter_id}_s${String(scene.idx).padStart(2, "0")}` : undefined;
}

function renderStateView(args: {
  loading: boolean;
  error: string | null;
  scene: SceneRow | null;
}): ReactNode | null {
  if (args.loading) return <main className="p-4 muted">Loading scene...</main>;
  if (args.error) return <main className="p-4 text-[#ff8f8f]">{args.error}</main>;
  if (!args.scene) return <main className="p-4 muted">Scene not found.</main>;
  return null;
}

export default function SceneDetailClient({ sceneId }: { sceneId: string }) {
  const { storySlug } = useStory();
  const [scene, setScene] = useState<SceneRow | null>(null);
  const [current, setCurrent] = useState<CurrentVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const detailUrl = useMemo(
    () => `${apiBase(storySlug)}/scenes/${sceneId}/versions`,
    [sceneId, storySlug]
  );

  const reloadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(detailUrl, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `GET_SCENE_FAILED_${res.status}`);
      setScene((json?.scene as SceneRow) ?? null);
      setCurrent((json?.current as CurrentVersion) ?? null);
    } catch (e: unknown) {
      setScene(null);
      setCurrent(null);
      setError(e instanceof Error ? e.message : "GET_SCENE_FAILED");
    } finally {
      setLoading(false);
    }
  }, [detailUrl]);

  useEffect(() => {
    let dead = false;
    const run = async () => {
      if (dead) return;
      await reloadDetail();
    };
    run();
    return () => {
      dead = true;
    };
  }, [reloadDetail]);

  const stateView = renderStateView({ loading, error, scene });
  if (stateView) return stateView;
  const safeScene = scene as SceneRow;
  const seedPrompt = buildSeedPrompt(safeScene);

  return (
    <main className="space-y-4 p-2 md:p-4">
      <div className="surface-card p-4">
        <div className="text-lg font-semibold tracking-tight">
          {safeScene.chapter_id} / #{safeScene.idx} {safeScene.title ? `- ${safeScene.title}` : ""}
        </div>
        <div className="muted text-sm">scene_id: {safeScene.id} | status: {safeScene.status} | story: {storySlug}</div>
        {current && (
          <div className="muted mt-2 text-sm">
            current: v{current.version_no} ({current.kind}) {current.summary ? `- ${current.summary}` : ""}
          </div>
        )}
      </div>

      <DraftRunner
        sceneId={String(safeScene.id)}
        sceneStatus={safeScene.status}
        workunitId={buildWorkunitId(safeScene)}
        currentVersionId={current?.id ?? null}
        currentVersionNo={current?.version_no ?? null}
        initialText={current?.text_content ?? ""}
        seedPrompt={seedPrompt}
        onCommitted={reloadDetail}
      />
    </main>
  );
}
