"use client";

import { useEffect, useState } from "react";

type StoryStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";
type LibraryStatus = "draft" | "published" | "archived" | "private";

type StoryItem = {
  slug: string;
  title: string;
  status: StoryStatus;
  system_prompt: string | null;
  tone_profile_json: Record<string, unknown>;
  default_llm_params_json: Record<string, unknown>;
  settings_json?: Record<string, unknown>;
};

type StoryMeta = {
  library_status: LibraryStatus;
  description_md: string | null;
  author_note_md: string | null;
  summary_md: string | null;
  tags: string[];
  cautions: string[];
  caution_other_md: string | null;
};

type FormState = {
  // Group 1: Human Ground Truth
  title: string;
  descriptionMd: string;
  summaryMd: string;
  authorNoteMd: string;
  tags: string;
  cautions: string;
  cautionOtherMd: string;

  // Group 2: AI Directives
  systemPrompt: string;
  toneProfileJson: string;
  writingLanguage: "en" | "vi";

  // Group 3: Technical / System
  status: StoryStatus;
  libraryStatus: LibraryStatus;
  defaultLlmParamsJson: string;
};

export default function StorySettingsForm({ slug, initialTab = "meta" }: { slug: string, initialTab?: "meta" | "tech" }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    descriptionMd: "",
    summaryMd: "",
    authorNoteMd: "",
    tags: "",
    cautions: "",
    cautionOtherMd: "",
    systemPrompt: "",
    toneProfileJson: "{}",
    writingLanguage: "en",
    status: "ACTIVE",
    libraryStatus: "draft",
    defaultLlmParamsJson: "{}",
  });

  useEffect(() => {
    let dead = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setOk(null);
      try {
        const [coreRes, metaRes] = await Promise.all([
          fetch(`/api/stories/${slug}`, { cache: "no-store" }),
          fetch(`/api/stories/${slug}/meta`, { cache: "no-store" }),
        ]);

        const coreJson = await coreRes.json();
        const metaJson = await metaRes.json();

        if (!coreRes.ok) throw new Error(coreJson?.error ?? "GET_STORY_FAILED");
        if (!metaRes.ok) throw new Error(metaJson?.error ?? "GET_META_FAILED");

        const core = coreJson.item as StoryItem;
        const meta = metaJson.item as StoryMeta;

        if (!dead) {
          setForm({
            title: core.title ?? "",
            descriptionMd: meta.description_md ?? "",
            summaryMd: meta.summary_md ?? "",
            authorNoteMd: meta.author_note_md ?? "",
            tags: (meta.tags ?? []).join(", "),
            cautions: (meta.cautions ?? []).join(", "),
            cautionOtherMd: meta.caution_other_md ?? "",
            systemPrompt: core.system_prompt ?? "",
            toneProfileJson: JSON.stringify(core.tone_profile_json ?? {}, null, 2),
            writingLanguage: core?.settings_json?.writing_language === "vi" ? "vi" : "en",
            status: core.status,
            libraryStatus: meta.library_status ?? "draft",
            defaultLlmParamsJson: JSON.stringify(core.default_llm_params_json ?? {}, null, 2),
          });
        }
      } catch (e: unknown) {
        if (!dead) setError(e instanceof Error ? e.message : "LOAD_FAILED");
      } finally {
        if (!dead) setLoading(false);
      }
    };

    run();
    return () => {
      dead = true;
    };
  }, [slug]);

  async function save() {
    setError(null);
    setOk(null);

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    let tone: Record<string, unknown> = {};
    let llm: Record<string, unknown> = {};
    try {
      tone = JSON.parse(form.toneProfileJson);
      llm = JSON.parse(form.defaultLlmParamsJson);
    } catch {
      setError("Invalid JSON in Tone or LLM params.");
      return;
    }

    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const cautions = form.cautions.split(",").map(t => t.trim()).filter(Boolean);

    setSaving(true);
    try {
      const [coreRes, metaRes] = await Promise.all([
        fetch(`/api/stories/${slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            status: form.status,
            system_prompt: form.systemPrompt,
            tone_profile_json: tone,
            default_llm_params_json: llm,
            settings_json: { writing_language: form.writingLanguage },
          }),
        }),
        fetch(`/api/stories/${slug}/meta`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            library_status: form.libraryStatus,
            description_md: form.descriptionMd,
            summary_md: form.summaryMd,
            author_note_md: form.authorNoteMd,
            tags,
            cautions,
            caution_other_md: form.cautionOtherMd,
          }),
        }),
      ]);

      if (!coreRes.ok || !metaRes.ok) throw new Error("SAVE_PARTIAL_FAILURE");
      setOk("All story data saved successfully.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-4 muted text-sm">Loading unified settings...</main>;

  return (
    <main className="space-y-6">
      <div className="surface-card p-4">
        <h1 className="text-xl font-bold tracking-tight">System Prompts & Technical Configuration</h1>
        <p className="muted text-xs">Be cautious when editing these values.</p>
      </div>

      <div className="grid gap-6">
        {initialTab === "meta" && (
          <>
            {/* GROUP 1: HUMAN GROUND TRUTH */}
            <div className="surface-card space-y-4 p-4 border-l-4 border-emerald-500/30">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                Ground Truth (Của con người)
              </h2>
              <label className="grid gap-1 text-xs">
                <span className="font-medium">Title</span>
                <input
                  className="shell-control px-3 py-2"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="font-medium">Description (Markdown)</span>
                <textarea
                  className="shell-control min-h-[100px] px-3 py-2"
                  value={form.descriptionMd}
                  onChange={(e) => setForm((p) => ({ ...p, descriptionMd: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="font-medium">Summary (The "Pitch")</span>
                <textarea
                  className="shell-control min-h-[80px] px-3 py-2"
                  value={form.summaryMd}
                  onChange={(e) => setForm((p) => ({ ...p, summaryMd: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium">Tags (Comma separated)</span>
                  <input
                    className="shell-control px-3 py-2"
                    value={form.tags}
                    onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium">Cautions</span>
                  <input
                    className="shell-control px-3 py-2"
                    value={form.cautions}
                    onChange={(e) => setForm((p) => ({ ...p, cautions: e.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs">
                <span className="font-medium">Author Note</span>
                <textarea
                  className="shell-control min-h-[60px] px-3 py-2"
                  value={form.authorNoteMd}
                  onChange={(e) => setForm((p) => ({ ...p, authorNoteMd: e.target.value }))}
                />
              </label>
            </div>
          </>
        )}

        {initialTab === "tech" && (
          <>
            <div className="space-y-6">
              {/* GROUP 2: AI DIRECTIVES */}
              <div className="surface-card space-y-4 p-4 border-l-4 border-blue-500/30">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
                  AI Directives (Chỉ dẫn cho AI)
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Writing Language</span>
                    <select
                      className="shell-control px-3 py-2"
                      value={form.writingLanguage}
                      onChange={(e) => setForm((p) => ({ ...p, writingLanguage: e.target.value as "en" | "vi" }))}
                    >
                      <option value="en">English (US)</option>
                      <option value="vi">Tiếng Việt</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium">System Prompt (The Master Instruction)</span>
                  <textarea
                    className="shell-control min-h-[120px] px-3 py-2 font-mono"
                    value={form.systemPrompt}
                    onChange={(e) => setForm((p) => ({ ...p, systemPrompt: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium">Tone Profile JSON</span>
                  <textarea
                    className="shell-control min-h-[100px] px-3 py-2 font-mono text-[10px]"
                    value={form.toneProfileJson}
                    onChange={(e) => setForm((p) => ({ ...p, toneProfileJson: e.target.value }))}
                  />
                </label>
              </div>

              {/* GROUP 3: TECHNICAL */}
              <div className="surface-card space-y-4 p-4 border-l-4 border-gray-500/30">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  System & Technical (Vận hành)
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Workflow Status</span>
                    <select
                      className="shell-control px-3 py-2"
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as StoryStatus }))}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Library Status</span>
                    <select
                      className="shell-control px-3 py-2"
                      value={form.libraryStatus}
                      onChange={(e) => setForm((p) => ({ ...p, libraryStatus: e.target.value as LibraryStatus }))}
                    >
                      <option value="draft">DRAFT</option>
                      <option value="published">PUBLISHED</option>
                      <option value="private">PRIVATE</option>
                      <option value="archived">ARCHIVED</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium">Global LLM Params JSON</span>
                  <textarea
                    className="shell-control min-h-[60px] px-3 py-2 font-mono text-[10px]"
                    value={form.defaultLlmParamsJson}
                    onChange={(e) => setForm((p) => ({ ...p, defaultLlmParamsJson: e.target.value }))}
                  />
                </label>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="surface-card sticky bottom-4 z-20 flex items-center justify-between p-4 shadow-xl border-t border-emerald-500/20">
        <div className="flex-1">
          {error && <div className="text-xs text-[#ff8f8f] font-medium">⚠️ {error}</div>}
          {ok && <div className="text-xs text-emerald-400 font-medium">✅ {ok}</div>}
        </div>
        <button
          type="button"
          className="shell-link flex items-center gap-2 px-6 py-2 text-sm font-bold bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/40 transition-all disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              Saving All...
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </main >
  );
}

