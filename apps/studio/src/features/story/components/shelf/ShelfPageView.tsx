import type { ShelfItem, ShelfScope } from "@/features/story/components/shelf/types";
import ShelfStoryCard from "@/features/story/components/shelf/ShelfStoryCard";

type ShelfPageViewProps = {
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
  onApplyFilter: () => void;
  onOpen: (slug: string) => void;
  onTogglePublished: (item: ShelfItem) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
  onUploadCover: (slug: string, file: File) => Promise<void>;
};

export default function ShelfPageView({
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
  onApplyFilter,
  onOpen,
  onTogglePublished,
  onDelete,
  onUploadCover,
}: ShelfPageViewProps) {
  return (
    <main className="space-y-4 p-2 md:p-4">
      <section className="surface-card p-3">
        <h1 className="text-2xl font-semibold tracking-tight">Story Shelf</h1>
        <div className="muted text-sm">Published stories for reading and discovery</div>
      </section>

      <section className="surface-card grid gap-2 p-3 md:grid-cols-5">
        <input
          className="shell-control px-2 py-2 text-sm md:col-span-2"
          placeholder="Search title or summary..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="shell-control px-2 py-2 text-sm"
          placeholder="Tags (comma)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="shell-control flex-1 px-2 py-2 text-sm"
            placeholder="Cautions (comma)"
            value={cautionsInput}
            onChange={(e) => setCautionsInput(e.target.value)}
          />
          <button type="button" className="shell-link px-3 py-2 text-sm" onClick={onApplyFilter}>
            Apply
          </button>
        </div>
        <select
          className="shell-control px-2 py-2 text-sm md:col-span-1"
          value={scope}
          onChange={(e) => setScope(e.target.value === "published" ? "published" : "all")}
        >
          <option value="all">All stories</option>
          <option value="published">Published only</option>
        </select>
      </section>

      {loading && <div className="muted text-sm">Loading shelf...</div>}
      {error && <div className="text-sm text-[#ff8f8f]">{error}</div>}

      {!loading && !error && (
        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {items.map((item) => (
            <ShelfStoryCard
              key={item.slug}
              item={item}
              actingSlug={actingSlug}
              onOpen={onOpen}
              onTogglePublished={onTogglePublished}
              onDelete={onDelete}
              onUploadCover={onUploadCover}
            />
          ))}
          {items.length === 0 && <div className="muted text-sm">No published stories found.</div>}
        </section>
      )}
    </main>
  );
}
