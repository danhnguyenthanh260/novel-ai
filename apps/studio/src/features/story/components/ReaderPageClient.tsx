"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SceneRead = {
  id: number;
  idx: number;
  title: string | null;
  text_content: string;
};

type ChapterNavData = {
  chapter_id: string;
  title: string | null;
};

type ChapterReadResponse = {
  story: { slug: string; title: string };
  chapter_id: string;
  prev_chapter_id: string | null;
  next_chapter_id: string | null;
  all_chapters: ChapterNavData[];
  scenes: SceneRead[];
};

export default function ReaderPageClient({ slug, chapterId }: { slug: string; chapterId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ChapterReadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScenes, setShowScenes] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyFullText = async () => {
    if (!data) return;
    const fullText = data.scenes.map((s) => s.text_content).join("\n\n");
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Copy failed", e);
    }
  };

  useEffect(() => {
    let dead = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stories/${slug}/chapters/${encodeURIComponent(chapterId)}/read`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `READER_FAILED_${res.status}`);
        if (!dead) setData(json as ChapterReadResponse);
      } catch (e: unknown) {
        if (!dead) setError(e instanceof Error ? e.message : "READER_FAILED");
      } finally {
        if (!dead) setLoading(false);
      }
    };
    run();
    return () => {
      dead = true;
    };
  }, [slug, chapterId]);

  if (loading) return <main className="p-4 flex items-center justify-center min-h-screen muted text-xs uppercase tracking-widest font-bold">Loading chapter...</main>;
  if (error) return <main className="p-4 text-[#ff8f8f] flex items-center justify-center min-h-screen">{error}</main>;
  if (!data) return <main className="p-4 muted flex items-center justify-center min-h-screen">No content.</main>;

  const NavContent = () => (
    <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto w-full my-4">
      <Link
        href={data?.prev_chapter_id ? `/read/${slug}/${data.prev_chapter_id}` : "#"}
        className={`px-3 py-1.5 text-xs font-bold border rounded transition-colors uppercase tracking-widest ${data?.prev_chapter_id
            ? "border-white/10 text-slate-300 hover:bg-white/5"
            : "border-transparent text-slate-600 cursor-not-allowed pointer-events-none"
          }`}
      >
        PREV
      </Link>

      <select
        className="bg-slate-900 border border-white/10 text-slate-300 text-xs font-bold px-3 py-1.5 rounded outline-none cursor-pointer focus:border-white/30 uppercase tracking-widest"
        value={data?.chapter_id}
        onChange={(e) => {
          if (e.target.value !== data?.chapter_id) {
            router.push(`/read/${slug}/${e.target.value}`);
          }
        }}
      >
        {data?.all_chapters.map(c => (
          <option key={c.chapter_id} value={c.chapter_id}>
            CHAPTER {c.chapter_id} {c.title ? `- ${c.title}` : ""}
          </option>
        ))}
      </select>

      <Link
        href={data?.next_chapter_id ? `/read/${slug}/${data.next_chapter_id}` : "#"}
        className={`px-3 py-1.5 text-xs font-bold border rounded transition-colors uppercase tracking-widest ${data?.next_chapter_id
            ? "border-white/10 text-slate-300 hover:bg-white/5"
            : "border-transparent text-slate-600 cursor-not-allowed pointer-events-none"
          }`}
      >
        NEXT
      </Link>
    </div>
  );

  return (
    <main className="space-y-4 p-2 md:p-4 pb-12">
      <section className="surface-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.story.title}</h1>
            <div className="muted text-sm uppercase tracking-widest">Chapter: {data.chapter_id}</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScenes(!showScenes)}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition uppercase"
              title="Toggle scene boundaries for analysis or raw reading"
            >
              {showScenes ? "FULL TEXT" : "BY SCENE"}
            </button>
            <button
              onClick={handleCopyFullText}
              className={`px-3 py-1.5 text-xs font-semibold rounded border transition uppercase ${copied
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                }`}
            >
              {copied ? "COPIED" : "COPY TEXT"}
            </button>
            <Link href={`/stories/${slug}`} className="shell-link px-3 py-1.5 text-xs uppercase font-bold ml-2">
              STORY HUB
            </Link>
          </div>
        </div>
      </section>

      <NavContent />

      <article className="surface-card p-4 md:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          {showScenes ? (
            data.scenes.map((scene) => (
              <section key={scene.id} className="space-y-3 border-b border-white/5 pb-8 last:border-0">
                <h2 className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-4">
                  Scene {scene.idx} {scene.title ? `| ${scene.title}` : ""}
                </h2>
                <div className="text-slate-200 whitespace-pre-wrap text-base leading-8">{scene.text_content || "(empty)"}</div>
              </section>
            ))
          ) : (
            <div className="text-slate-200 whitespace-pre-wrap text-[17px] leading-relaxed tracking-wide">
              {data.scenes.map((s) => s.text_content).join("\n\n")}
            </div>
          )}
        </div>
      </article>

      <NavContent />
    </main>
  );
}
