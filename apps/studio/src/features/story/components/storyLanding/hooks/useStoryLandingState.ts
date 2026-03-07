import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArcItem, ChapterItem, PublicDetail } from "@/features/story/components/storyLanding/types";
import { imageSrc, readJsonSafe } from "@/features/story/components/storyLanding/utils";

type UseStoryLandingStateResult = {
  item: PublicDetail | null;
  chapters: ChapterItem[];
  arcs: ArcItem[];
  loading: boolean;
  error: string | null;
  cover: string | null;
  background: string | null;
  totalScenes: number;
  refresh: () => Promise<void>;
  saveMeta: (patch: {
    title?: string;
    tags?: string[];
    summary_md?: string | null;
    description_md?: string | null;
  }) => Promise<void>;
  uploadCover: (file: File) => Promise<void>;
  createArc: (name: string) => Promise<void>;
  deleteArc: (id: number) => Promise<void>;
  assignChapterToArc: (chapterId: string, arcId: number | null) => Promise<void>;
};

function responseError(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload?.error === "string" ? payload.error : fallback;
}

function ensureResponseOk(res: Response, payload: Record<string, unknown>, fallback: string): void {
  if (res.ok) return;
  throw new Error(responseError(payload, fallback));
}

function normalizeChapters(items: unknown): ChapterItem[] {
  return Array.isArray(items) ? (items as ChapterItem[]) : [];
}

async function fetchStoryLandingPayload(slug: string): Promise<{ item: PublicDetail; chapters: ChapterItem[]; arcs: ArcItem[] }> {
  const [publicRes, chaptersRes, arcsRes] = await Promise.all([
    fetch(`/api/stories/${slug}/public`, { cache: "no-store" }),
    fetch(`/api/stories/${slug}/chapters`, { cache: "no-store" }),
    fetch(`/api/stories/${slug}/arcs`, { cache: "no-store" }),
  ]);
  const [publicJson, chaptersJson, arcsJson] = await Promise.all([
    readJsonSafe(publicRes),
    readJsonSafe(chaptersRes),
    readJsonSafe(arcsRes)
  ]);

  ensureResponseOk(publicRes, publicJson, `STORY_PUBLIC_FAILED_${publicRes.status}`);
  ensureResponseOk(chaptersRes, chaptersJson, `STORY_CHAPTERS_FAILED_${chaptersRes.status}`);
  ensureResponseOk(arcsRes, arcsJson, `STORY_ARCS_FAILED_${arcsRes.status}`);

  return {
    item: publicJson.item as PublicDetail,
    chapters: normalizeChapters(chaptersJson?.items),
    arcs: Array.isArray(arcsJson?.items) ? (arcsJson.items as ArcItem[]) : [],
  };
}

export function useStoryLandingState(slug: string): UseStoryLandingStateResult {
  const [item, setItem] = useState<PublicDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [arcs, setArcs] = useState<ArcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cover = useMemo(() => imageSrc(item?.cover_image_path ?? null), [item?.cover_image_path]);
  const background = useMemo(() => imageSrc(item?.background_image_path ?? null), [item?.background_image_path]);
  const totalScenes = useMemo(() => chapters.reduce((sum, c) => sum + Number(c.scene_count || 0), 0), [chapters]);

  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const payload = await fetchStoryLandingPayload(slug);
      setItem(payload.item);
      setChapters(payload.chapters);
      setArcs(payload.arcs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "STORY_PUBLIC_FAILED");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const saveMeta = useCallback(async (patch: Parameters<UseStoryLandingStateResult["saveMeta"]>[0]) => {
    setError(null);
    try {
      const res = await fetch(`/api/stories/${slug}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      ensureResponseOk(res, json, "SAVE_META_FAILED");
      await load(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "SAVE_META_FAILED");
      throw e;
    }
  }, [slug, load]);

  return {
    item,
    chapters,
    arcs,
    loading,
    error,
    cover,
    background,
    totalScenes,
    refresh: () => load(),
    saveMeta,
    uploadCover: async (file: File) => {
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/stories/${slug}/cover`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        ensureResponseOk(res, json, "UPLOAD_FAILED");
        await load(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "UPLOAD_FAILED");
        throw e;
      }
    },
    createArc: async (name: string) => {
      setError(null);
      try {
        const res = await fetch(`/api/stories/${slug}/arcs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const json = await res.json();
        ensureResponseOk(res, json, "CREATE_ARC_FAILED");
        await load(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "CREATE_ARC_FAILED");
        throw e;
      }
    },
    deleteArc: async (id: number) => {
      setError(null);
      try {
        const res = await fetch(`/api/stories/${slug}/arcs?id=${id}`, {
          method: "DELETE",
        });
        const json = await res.json();
        ensureResponseOk(res, json, "DELETE_ARC_FAILED");
        await load(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "DELETE_ARC_FAILED");
        throw e;
      }
    },
    assignChapterToArc: async (chapterId: string, arcId: number | null) => {
      console.log(`[ASSIGN_CHAPTER_TO_ARC] chapterId=${chapterId} arcId=${arcId}`);
      setError(null);
      try {
        const res = await fetch(`/api/stories/${slug}/chapters/arc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_id: chapterId, arc_id: arcId }),
        });
        const json = await res.json();
        ensureResponseOk(res, json, "ASSIGN_ARC_FAILED");
        await load(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "ASSIGN_ARC_FAILED");
        throw e;
      }
    },
  };
}
