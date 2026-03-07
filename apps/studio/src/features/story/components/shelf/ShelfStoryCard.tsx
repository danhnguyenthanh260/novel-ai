import React from "react";
import Link from "next/link";
import type { ShelfItem } from "@/features/story/components/shelf/types";
import { coverSrc } from "@/features/story/components/shelf/utils";

type ShelfStoryCardProps = {
  item: ShelfItem;
  actingSlug: string | null;
  onOpen: (slug: string) => void;
  onTogglePublished: (item: ShelfItem) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
  onUploadCover: (slug: string, file: File) => Promise<void>;
};

export default function ShelfStoryCard({
  item,
  actingSlug,
  onOpen,
  onTogglePublished,
  onDelete,
  onUploadCover,
}: ShelfStoryCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const src = coverSrc(item.cover_image_path);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadCover(item.slug, file).catch(() => undefined);
    }
  };

  const triggerUpload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <article
      key={item.slug}
      className="surface-card group relative overflow-hidden p-3 text-left transition hover:-translate-y-0.5 hover:border-[#34506d] cursor-pointer"
      onClick={() => onOpen(item.slug)}
    >
      <div className="absolute right-0 top-0 z-20 p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Delete Story"
          className="rounded bg-black/70 p-3 text-sm text-[#ff8f8f] backdrop-blur hover:bg-red-900/60 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.slug);
          }}
          disabled={actingSlug === item.slug}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <div className="relative mb-3 aspect-[16/9] overflow-hidden rounded-lg border border-[#223247] bg-[#121d2b]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="muted flex h-full w-full items-center justify-center text-sm italic">No cover</div>
        )}

        <div
          className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
          role="button"
          tabIndex={0}
          onClick={triggerUpload}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
          <span className="rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md pointer-events-none">
            Click to Upload
          </span>
        </div>
      </div>

      <div className="text-lg font-semibold tracking-tight">{item.title}</div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`status-pill ${item.library_status === "published" ? "status-pill--drafting" : "status-pill--other"
            }`}
        >
          {item.library_status}
        </span>
      </div>
      <div className="muted mt-1 text-xs">slug: {item.slug}</div>
      <div className="muted mt-1 line-clamp-3 text-sm">{item.summary_md || "No summary yet."}</div>
      <div className="muted mt-2 text-xs">updated: {new Date(item.updated_at).toLocaleDateString()}</div>

      <div className="mt-2 flex flex-wrap gap-1">
        {item.tags.slice(0, 6).map((t) => (
          <span key={`tag-${item.slug}-${t}`} className="status-pill status-pill--drafting">
            {t}
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {item.cautions.slice(0, 6).map((c) => (
          <span key={`c-${item.slug}-${c}`} className="status-pill border-[#6f3a3a] bg-[#3b1a1a] text-[#ff8f8f]">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="shell-link px-3 py-2 text-sm" onClick={(e) => { e.stopPropagation(); onOpen(item.slug); }}>
          Open
        </button>
        <button
          type="button"
          className="shell-link px-3 py-2 text-sm"
          disabled={actingSlug === item.slug}
          onClick={(e) => { e.stopPropagation(); onTogglePublished(item); }}
        >
          {item.library_status === "published" ? "Set Draft" : "Publish"}
        </button>
      </div>
    </article>
  );
}
