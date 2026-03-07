import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import type { ArcItem, ChapterItem, PublicDetail } from "@/features/story/components/storyLanding/types";
import { RR_GENRES, RR_TAGS, RR_WARNINGS } from "@/features/story/components/storyLanding/constants";
import TagPicker from "@/features/story/components/storyLanding/TagPicker";

type StoryLandingViewProps = {
  slug: string;
  item: PublicDetail;
  chapters: ChapterItem[];
  arcs: ArcItem[];
  cover: string | null;
  background: string | null;
  totalScenes: number;
  saveMeta: (patch: {
    title?: string;
    tags?: string[];
    cautions?: string[];
    summary_md?: string | null;
    description_md?: string | null;
  }) => Promise<void>;
  uploadCover: (file: File) => Promise<void>;
  createArc: (name: string) => Promise<void>;
  deleteArc: (id: number) => Promise<void>;
  assignChapterToArc: (chapterId: string, arcId: number | null) => Promise<void>;
};

export default function StoryLandingView({
  slug,
  item,
  chapters,
  arcs,
  cover,
  background,
  totalScenes,
  saveMeta,
  uploadCover,
  createArc,
  deleteArc,
  assignChapterToArc,
}: StoryLandingViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: item.title,
    tags: [...item.tags],
    cautions: [...item.cautions],
    summary: item.summary_md || "",
    description: item.description_md || "",
  });
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({});
  const [isAddingArc, setIsAddingArc] = useState(false);
  const [newArcName, setNewArcName] = useState("");
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null);
  const [arcDropHover, setArcDropHover] = useState<string | null>(null);
  const [assigningChapterId, setAssigningChapterId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const suppressDragClickRef = useRef(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveMeta({
        title: editForm.title,
        tags: editForm.tags,
        cautions: editForm.cautions,
        summary_md: editForm.summary,
        description_md: editForm.description,
      });

      const chapterPromises = Object.entries(chapterTitles).map(([chapterId, title]) =>
        fetch(`/api/stories/${slug}/chapters/meta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_id: chapterId, title }),
        })
      );
      if (chapterPromises.length > 0) {
        await Promise.all(chapterPromises);
      }

      setIsEditing(false);
    } catch {
      // Error handled by parent hook
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    setEditForm((p) => {
      const exists = p.tags.includes(tag);
      if (exists) return { ...p, tags: p.tags.filter((t) => t !== tag) };
      return { ...p, tags: [...p.tags, tag] };
    });
  };

  const addCustomTag = (tag: string) => {
    setEditForm((p) => {
      if (p.tags.includes(tag)) return p;
      return { ...p, tags: [...p.tags, tag] };
    });
  };

  const toggleCaution = (code: string) => {
    setEditForm((p) => {
      const exists = p.cautions.includes(code);
      if (exists) return { ...p, cautions: p.cautions.filter((c) => c !== code) };
      return { ...p, cautions: [...p.cautions, code] };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsSaving(true);
      try {
        await uploadCover(file);
      } catch {
        // Handled
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, chapterId: string) => {
    setDraggingChapterId(chapterId);
    e.dataTransfer.setData("application/x-story-chapter-id", chapterId);
    e.dataTransfer.setData("text/plain", chapterId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggingChapterId(null);
    setArcDropHover(null);
  };

  useEffect(() => {
    console.log("[STORY_LANDING_ARCS]", arcs);
  }, [arcs]);

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleAssignArc = async (chapterId: string, arcId: number | null) => {
    if (!chapterId) return;
    setAssigningChapterId(chapterId);
    try {
      await assignChapterToArc(chapterId, arcId);
    } finally {
      setAssigningChapterId(null);
    }
  };

  const readDraggedChapterId = (evt: React.DragEvent<HTMLElement>): string => {
    const custom = evt.dataTransfer.getData("application/x-story-chapter-id");
    if (custom) return custom.trim();
    const fallback = evt.dataTransfer.getData("text/plain");
    return String(fallback || "").trim();
  };

  return (
    <main className="relative min-h-screen bg-[#0d121a] text-slate-200">
      {/* Background Banner */}
      <section className="relative h-64 overflow-hidden">
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={background} alt="banner" className="h-full w-full object-cover opacity-30 shadow-inner blur-[2px]" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_20%_30%,rgba(66,199,184,.1),transparent_45%),radial-gradient(circle_at_80%_20%,rgba(242,179,95,.08),transparent_40%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d121a] to-transparent" />
      </section>

      {/* Main Header Card - Royal Road Inspired */}
      <section className="mx-auto -mt-32 max-w-6xl px-4 md:px-6">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          {/* Left: Vertical Cover */}
          <div
            className="group/cover relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-lg border-2 border-white/10 bg-[#121d2b] shadow-2xl transition-all hover:border-blue-500/50 active:scale-[0.98]"
            onClick={triggerUpload}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={item.title} className="h-full w-full object-cover transition-transform group-hover/cover:scale-105" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm italic text-slate-500">
                Click to upload cover
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover/cover:opacity-100">
              <span className="rounded bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md border border-white/20">
                Change Image
              </span>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            <div className="absolute bottom-2 right-2 text-[10px] font-bold tracking-widest text-white/40 uppercase">DEI8</div>
          </div>

          {/* Right: Meta Info */}
          <div className="flex flex-col justify-end pb-2">
            {!isEditing ? (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 border border-slate-600/30">
                    {item.library_status}
                  </span>
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300 border border-blue-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <h1 className="text-4xl font-bold tracking-tight text-white mb-2">{item.title}</h1>

                <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
                  <span className="font-medium text-slate-300">by DEI8</span>
                  <span className="text-white/10">|</span>
                  <span>{new Date(item.created_at).getFullYear()}</span>
                </div>
              </>
            ) : (
              <div className="mb-4 space-y-6 rounded-xl bg-[#1a2333]/80 p-6 border-2 border-blue-500/30 shadow-2xl backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Metadata Settings</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Title</label>
                  <input
                    className="block w-full rounded border border-white/10 bg-[#0d121a] px-3 py-2 text-2xl font-bold text-white shadow-inner focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    placeholder="Story Title"
                    value={editForm.title}
                    onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>

                <div className="grid gap-6">
                  <TagPicker label="Main Genres" selected={editForm.tags} options={RR_GENRES} onToggle={toggleTag} />
                  <TagPicker label="Sub-Tags & Themes" selected={editForm.tags} options={RR_TAGS} onToggle={toggleTag} onAddCustom={addCustomTag} />
                  <TagPicker label="Content Warnings" selected={editForm.cautions} options={RR_WARNINGS} onToggle={toggleCaution} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/read/${slug}/${encodeURIComponent(chapters[0]?.chapter_id || "")}`}
                className={`flex items-center gap-2 rounded bg-blue-600 px-6 py-2.5 font-bold text-white transition hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-500/10 ${!chapters[0] ? "pointer-events-none opacity-50" : ""
                  }`}
              >
                START READING
              </Link>
              <Link
                href={`/stories/${slug}/write`}
                className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-5 py-2.5 font-semibold text-slate-200 transition hover:bg-white/10"
              >
                CONTINUE WRITING
              </Link>
              <Link
                href={`/stories/${slug}/analysis`}
                className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
              >
                ANALYSIS CONSOLE
              </Link>
              <Link
                href={`/stories/${slug}/memory`}
                className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              >
                MEMORY HUB
              </Link>
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm font-semibold transition ${isEditing ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                disabled={isSaving}
              >
                {isSaving ? "SAVING..." : isEditing ? "SAVE CHANGES" : "EDIT DETAILS"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-300 transition"
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      title: item.title,
                      tags: [...item.tags],
                      cautions: [...item.cautions],
                      summary: item.summary_md || "",
                      description: item.description_md || "",
                    });
                    setChapterTitles({});
                  }}
                  disabled={isSaving}
                >
                  CANCEL
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Details Sections */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
          <div className="space-y-12">
            {/* Warnings section */}
            {/* Warnings section (Always visible unless editing, but integrated in sidebar/meta) */}
            {!isEditing && (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 text-center">
                <p className="text-sm font-bold text-yellow-300 uppercase tracking-widest mb-1">Content Advisory</p>
                <p className="text-sm text-yellow-100/80 italic">
                  Characterised by: {item.cautions.join(", ") || "No specific warnings."}
                  {item.caution_other_md && ` | ${item.caution_other_md}`}
                </p>
              </div>
            )}

            {/* Description / Worldbuilding */}
            <article>
              <h2 className="text-xl font-bold text-white mb-4 border-b border-white/5 pb-2">Overview & Worldbuilding</h2>
              {!isEditing ? (
                <p className="muted leading-relaxed whitespace-pre-wrap">
                  {item.description_md || "No detailed worldbuilding description provided."}
                </p>
              ) : (
                <textarea
                  className="w-full min-h-[200px] rounded border border-blue-500/40 bg-[#1a2333] p-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-400"
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Detailed worldbuilding info..."
                />
              )}
            </article>

            {/* Narrative Arcs Management */}
            <section>
              <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-2">
                <h2 className="text-xl font-bold text-white uppercase tracking-wider">Narrative Arcs</h2>
                {!isAddingArc ? (
                  <button
                    onClick={() => setIsAddingArc(true)}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition uppercase tracking-widest"
                  >
                    + NEW ARC
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      className="bg-[#1a2333] border border-blue-500/30 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-blue-400"
                      placeholder="Arc name..."
                      value={newArcName}
                      onChange={(e) => setNewArcName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void createArc(newArcName);
                          setNewArcName("");
                          setIsAddingArc(false);
                        }
                        if (e.key === "Escape") setIsAddingArc(false);
                      }}
                    />
                    <button
                      onClick={() => {
                        void createArc(newArcName);
                        setNewArcName("");
                        setIsAddingArc(false);
                      }}
                      className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 uppercase"
                    >
                      ADD
                    </button>
                    <button
                      onClick={() => setIsAddingArc(false)}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-400 uppercase"
                    >
                      CANCEL
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <div
                  className={`rounded border border-dashed px-3 py-1.5 text-xs font-semibold transition ${arcDropHover === "__unassigned__"
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-600 bg-slate-800/40 text-slate-300"
                    }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!draggingChapterId) return;
                    setArcDropHover("__unassigned__");
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (!draggingChapterId) return;
                    setArcDropHover("__unassigned__");
                  }}
                  onDragLeave={() => {
                    if (arcDropHover === "__unassigned__") setArcDropHover(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const chapterId = readDraggedChapterId(e);
                    setArcDropHover(null);
                    setDraggingChapterId(null);
                    suppressDragClickRef.current = true;
                    window.setTimeout(() => {
                      suppressDragClickRef.current = false;
                    }, 120);
                    if (chapterId) void handleAssignArc(chapterId, null);
                  }}
                >
                  Unassigned (drop here)
                </div>
                {arcs.map((arc) => (
                  <div
                    key={arc.id}
                    className={`group relative flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold transition ${arcDropHover === `arc:${arc.id}`
                      ? "border-blue-300 bg-blue-500/30 text-blue-100"
                      : "border-blue-500/20 bg-blue-500/10 text-blue-300"
                      }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!draggingChapterId) return;
                      setArcDropHover(`arc:${arc.id}`);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (!draggingChapterId) return;
                      setArcDropHover(`arc:${arc.id}`);
                    }}
                    onDragLeave={() => {
                      if (arcDropHover === `arc:${arc.id}`) setArcDropHover(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const chapterId = readDraggedChapterId(e);
                      console.log(`[DROP_TO_ARC] chapterId=${chapterId} arcId=${arc.id}`);
                      setArcDropHover(null);
                      setDraggingChapterId(null);
                      suppressDragClickRef.current = true;
                      window.setTimeout(() => {
                        suppressDragClickRef.current = false;
                      }, 120);
                      if (chapterId) void handleAssignArc(chapterId, arc.id);
                    }}
                  >
                    <span>{arc.name}</span>
                    <button
                      onClick={() => void deleteArc(arc.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                      title="Delete Arc"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
                {arcs.length === 0 && (
                  <span className="text-xs italic text-slate-500">No arcs defined yet. Create one to organize your story.</span>
                )}
              </div>
            </section>

            {/* Summary / The Pitch */}
            <article>
              <h2 className="text-xl font-bold text-white mb-4 border-b border-white/5 pb-2">The Pitch (Summary)</h2>
              {!isEditing ? (
                <p className="muted leading-relaxed whitespace-pre-wrap italic">
                  {item.summary_md || "No pitch/summary available."}
                </p>
              ) : (
                <textarea
                  className="w-full min-h-[120px] rounded border border-blue-500/40 bg-[#1a2333] p-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-400 italic"
                  value={editForm.summary}
                  onChange={(e) => setEditForm((p) => ({ ...p, summary: e.target.value }))}
                  placeholder="Summary of the story..."
                />
              )}
            </article>

            {/* Chapter List */}
            <section>
              <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-2">
                <h2 className="text-xl font-bold text-white uppercase tracking-wider">Chapters</h2>
                <span className="text-xs font-bold text-slate-500">{chapters.length} CHAPTERS</span>
              </div>
              <div className="grid gap-2">
                {chapters.map((ch) => (
                  <Link
                    key={ch.chapter_id}
                    href={`/read/${slug}/${encodeURIComponent(ch.chapter_id)}`}
                    draggable={true}
                    onDragStart={(e) => {
                      setDraggingChapterId(ch.chapter_id);
                      suppressDragClickRef.current = true;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("application/x-story-chapter-id", ch.chapter_id);
                      e.dataTransfer.setData("text/plain", ch.chapter_id);
                    }}
                    onDragEnd={() => {
                      setDraggingChapterId(null);
                      setArcDropHover(null);
                      window.setTimeout(() => {
                        suppressDragClickRef.current = false;
                      }, 120);
                    }}
                    onClick={(e) => {
                      if (suppressDragClickRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className={`group flex flex-col justify-between gap-3 rounded-lg border bg-white/[0.02] p-4 transition hover:bg-white/[0.05] sm:flex-row sm:items-center ${draggingChapterId === ch.chapter_id
                      ? "border-cyan-400/70 opacity-60"
                      : "border-white/5 hover:border-white/10"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-white/20 group-hover:text-blue-500/50 transition truncate max-w-[80px]">
                        {ch.chapter_id.toUpperCase()}
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          className="rounded border border-blue-500/30 bg-[#1a2333] px-2 py-1 text-sm font-semibold text-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                          placeholder="Chapter Title..."
                          value={chapterTitles[ch.chapter_id] ?? ch.title ?? ""}
                          onChange={(e) => setChapterTitles((p) => ({ ...p, [ch.chapter_id]: e.target.value }))}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        />
                      ) : (
                        <span className="font-semibold text-slate-200">{ch.title || "Untitled Chapter"}</span>
                      )}
                      {ch.is_stable && (
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-2.5 w-2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          VERIFIED {ch.version && `v${ch.version}`}
                        </span>
                      )}

                      {/* Arc Selector */}
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">ARC:</span>
                        <select
                          className="bg-transparent text-[11px] font-bold text-blue-400 outline-none cursor-pointer hover:text-blue-300 border-none p-0 focus:ring-0"
                          value={ch.arc_id || ""}
                          disabled={assigningChapterId === ch.chapter_id}
                          onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleAssignArc(ch.chapter_id, e.target.value ? Number(e.target.value) : null);
                          }}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                          <option value="" className="bg-[#121d2b]">Unassigned</option>
                          {arcs.map(a => (
                            <option key={a.id} value={a.id} className="bg-[#121d2b]">{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                      <span>{new Date(ch.updated_at).toLocaleDateString()}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" />
                      <span>{ch.scene_count} SCENES</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column / Sidebar Info */}
          <aside className="space-y-8 lg:mt-24">
            <div className="rounded-xl bg-white/[0.03] p-5 border border-white/5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Story Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-white">{totalScenes}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Scenes</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-white">{chapters.length}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Chapters</span>
                </div>
              </div>
              <div className="mt-6 space-y-3 text-xs border-t border-white/5 pt-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="text-slate-200 font-bold">{item.library_status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">First Published</span>
                  <span className="text-slate-200">{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Update</span>
                  <span className="text-slate-200">{new Date(item.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <article className="rounded-xl bg-slate-900/40 p-5 border border-white/5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Author Notes</h3>
              <p className="text-sm whitespace-pre-wrap leading-relaxed italic text-slate-400">
                {item.author_note_md || "The author has not left a note yet."}
              </p>
            </article>

            <Link
              href="/shelf"
              className="flex items-center justify-center gap-2 rounded-md bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-white/10 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Shelf
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
