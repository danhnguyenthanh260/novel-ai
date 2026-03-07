import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShelfItem, ShelfScope } from "@/features/story/components/shelf/types";

type UseShelfStateResult = {
  items: ShelfItem[];
  loading: boolean;
  error: string | null;
  q: string;
  setQ: (value: string) => void;
  tagsInput: string;
  setTagsInput: (value: string) => void;
  cautionsInput: string;
  setCautionsInput: (value: string) => void;
  scope: ShelfScope;
  setScope: (value: ShelfScope) => void;
  actingSlug: string | null;
  queryKey: number;
  setQueryKey: (value: number | ((prev: number) => number)) => void;
  load: () => Promise<void>;
  toggleDraftPublished: (item: ShelfItem) => Promise<void>;
  deleteStory: (slug: string) => Promise<void>;
  uploadCover: (slug: string, file: File) => Promise<void>;
};

export function useShelfState(): UseShelfStateResult {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [cautionsInput, setCautionsInput] = useState("");
  const [scope, setScope] = useState<ShelfScope>("all");
  const [actingSlug, setActingSlug] = useState<string | null>(null);
  const [queryKey, setQueryKey] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (tagsInput.trim()) p.set("tags", tagsInput.trim());
    if (cautionsInput.trim()) p.set("cautions", cautionsInput.trim());
    p.set("scope", scope);
    // Explicitly set a high limit if not searching to ensure all items are visible
    if (!q.trim() && !tagsInput.trim() && !cautionsInput.trim()) {
      p.set("limit", "100");
    }
    return p.toString();
  }, [q, tagsInput, cautionsInput, scope]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const suffix = query ? `?${query}` : "";
      const res = await fetch(`/api/shelf${suffix}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `SHELF_FAILED_${res.status}`);
      setItems(Array.isArray(json?.items) ? (json.items as ShelfItem[]) : []);
    } catch (e: unknown) {
      setItems([]);
      setError(e instanceof Error ? e.message : "SHELF_FAILED");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, queryKey]);

  const toggleDraftPublished = useCallback(
    async (item: ShelfItem) => {
      setActingSlug(item.slug);
      setError(null);
      try {
        const next = item.library_status === "published" ? "draft" : "published";
        const res = await fetch(`/api/stories/${item.slug}/meta`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ library_status: next }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `PATCH_STATUS_FAILED_${res.status}`);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "PATCH_STATUS_FAILED");
      } finally {
        setActingSlug(null);
      }
    },
    [load]
  );

  const deleteStory = useCallback(
    async (slug: string) => {
      if (!confirm(`Are you sure you want to delete "${slug}"? This is permanent.`)) return;
      setActingSlug(slug);
      setError(null);
      try {
        const res = await fetch(`/api/stories/${slug}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `DELETE_FAILED_${res.status}`);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "DELETE_FAILED");
      } finally {
        setActingSlug(null);
      }
    },
    [load]
  );

  const uploadCover = useCallback(
    async (slug: string, file: File) => {
      setActingSlug(slug);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/stories/${slug}/cover`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `UPLOAD_FAILED_${res.status}`);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "UPLOAD_FAILED");
      } finally {
        setActingSlug(null);
      }
    },
    [load]
  );

  return {
    items,
    loading,
    error,
    q,
    setQ,
    tagsInput,
    setTagsInput,
    cautionsInput,
    setCautionsInput,
    scope,
    setScope,
    actingSlug,
    queryKey,
    setQueryKey,
    load,
    toggleDraftPublished,
    deleteStory,
    uploadCover,
  };
}
