"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { LlmProviderSelector } from "@/features/llm/components/LlmProviderSelector";
import { useStory } from "./StoryContext";

type StoryItem = {
  slug: string;
  title: string;
  status: string;
  settings_json?: Record<string, unknown>;
};

type CreateForm = {
  slug: string;
  title: string;
  status: "ACTIVE" | "DRAFT";
  systemPrompt: string;
  toneProfileJson: string;
  defaultLlmParamsJson: string;
};

const SLUG_RE = /^[a-z0-9_]+$/;

export default function StorySelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { storySlug, setStorySlug, writingLanguage, setWritingLanguage, headerBusy, runHeaderAction } = useStory();
  const [items, setItems] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    slug: "",
    title: "",
    status: "ACTIVE",
    systemPrompt: "",
    toneProfileJson: "{}",
    defaultLlmParamsJson: "{}",
  });

  async function loadStories() {
    setLoading(true);
    try {
      const res = await fetch("/api/stories", { cache: "no-store" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStories();
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const openLibrary = () => setShowLibrary(true);
    window.addEventListener("novel:open-story-picker", openLibrary);
    return () => window.removeEventListener("novel:open-story-picker", openLibrary);
  }, []);

  const routeStorySlug = (() => {
    const fromStories = pathname.match(/^\/stories\/([^/]+)/);
    if (fromStories?.[1]) return decodeURIComponent(fromStories[1]);
    const fromRead = pathname.match(/^\/read\/([^/]+)/);
    if (fromRead?.[1]) return decodeURIComponent(fromRead[1]);
    return null;
  })();

  const storyExists = items.some((i) => i.slug === storySlug);
  const selectedSlug =
    routeStorySlug && items.some((i) => i.slug === routeStorySlug)
        ? routeStorySlug
        : storyExists
          ? storySlug
          : null;
  const selectedItem = selectedSlug ? items.find((i) => i.slug === selectedSlug) : undefined;

  useEffect(() => {
    const langRaw =
      typeof selectedItem?.settings_json?.writing_language === "string" ? selectedItem.settings_json.writing_language : "en";
    setWritingLanguage(langRaw === "vi" ? "vi" : "en");
  }, [selectedItem, setWritingLanguage]);

  async function saveWritingLanguage(next: "en" | "vi") {
    const slug = selectedSlug ?? "default";
    setWritingLanguage(next);
    setSavingLang(true);
    try {
      await runHeaderAction("Saving language...", async () => {
        const merged = {
          ...(selectedItem?.settings_json ?? {}),
          writing_language: next,
        };
        await fetch(`/api/stories/${slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings_json: merged }),
        });
        await loadStories();
      });
    } finally {
      setSavingLang(false);
    }
  }

  async function submitCreateStory() {
    setFormError(null);
    const slug = form.slug.trim();
    const title = form.title.trim();

    if (!slug || !SLUG_RE.test(slug)) {
      setFormError("Slug must match [a-z0-9_].");
      return;
    }
    if (!title) {
      setFormError("Title is required.");
      return;
    }

    let tone: Record<string, unknown> = {};
    let llm: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(form.toneProfileJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      tone = parsed as Record<string, unknown>;
    } catch {
      setFormError("tone_profile_json must be a JSON object.");
      return;
    }

    try {
      const parsed = JSON.parse(form.defaultLlmParamsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      llm = parsed as Record<string, unknown>;
    } catch {
      setFormError("default_llm_params_json must be a JSON object.");
      return;
    }

    setSubmitting(true);
    try {
      await runHeaderAction("Creating story...", async () => {
        const res = await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            title,
            status: form.status,
            system_prompt: form.systemPrompt.trim() || null,
            tone_profile_json: tone,
            default_llm_params_json: llm,
          }),
        });

        const json = await res.json();
        if (res.status === 409) {
          setFormError("Slug already exists.");
          return;
        }
        if (!res.ok) {
          setFormError(json?.error ?? `CREATE_FAILED_${res.status}`);
          return;
        }

        await loadStories();
        setStorySlug(slug);
        setShowNew(false);
        setForm({
          slug: "",
          title: "",
          status: "ACTIVE",
          systemPrompt: "",
          toneProfileJson: "{}",
          defaultLlmParamsJson: "{}",
        });
        router.push(`/stories/${encodeURIComponent(slug)}/write`);
        router.refresh();
      });
    } catch {
      setFormError("CREATE_FAILED");
    } finally {
      setSubmitting(false);
    }
  }

  const actionsDisabled = loading || headerBusy;
  const switchDisabled = actionsDisabled || !selectedSlug || savingLang;
  const disabledLinkClass = useMemo(() => (actionsDisabled ? "pointer-events-none opacity-50" : ""), [actionsDisabled]);
  const storyLinkBase = selectedSlug ? `/stories/${selectedSlug}` : "";
  const disabledHref = "#";
  const navItems = useMemo(
    () => [
      { label: "Pipelines", href: selectedSlug ? `${storyLinkBase}/pipelines` : disabledHref, match: "/pipelines" },
      { label: "Ingest", href: selectedSlug ? `${storyLinkBase}/ingest` : disabledHref, match: "/ingest" },
      { label: "Write", href: selectedSlug ? `${storyLinkBase}/write` : disabledHref, match: "/write" },
      { label: "Analysis", href: selectedSlug ? `${storyLinkBase}/analysis` : disabledHref, match: "/analysis" },
      { label: "Memory", href: selectedSlug ? `${storyLinkBase}/memory` : disabledHref, match: "/memory" },
      { label: "Map", href: selectedSlug ? `${storyLinkBase}/map` : disabledHref, match: "/map" },
    ],
    [selectedSlug, storyLinkBase, disabledHref]
  );
  const moreItems = useMemo(
    () => [
      { label: "Agents", href: selectedSlug ? `${storyLinkBase}/agents` : disabledHref },
      { label: "Reviews", href: selectedSlug ? `${storyLinkBase}/reviews` : disabledHref },
      { label: "Feedback", href: selectedSlug ? `${storyLinkBase}/feedback` : disabledHref },
      { label: "Settings", href: selectedSlug ? `${storyLinkBase}/settings` : disabledHref },
    ],
    [selectedSlug, storyLinkBase, disabledHref]
  );
  const activeNavItem = useMemo(() => navItems.find((item) => pathname.includes(item.match)) ?? navItems[0], [navItems, pathname]);

  return (
    <div className="flex max-w-[calc(100vw-180px)] flex-wrap items-center justify-end gap-2 text-sm">
      <div className="shell-control flex min-w-0 items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded border border-[#2a3441] bg-[#0d1524] text-[var(--text-secondary)] transition hover:border-[#3e867f] hover:text-[var(--accent)]"
          onClick={() => setShowLibrary(true)}
          disabled={actionsDisabled}
          title="Choose story"
          aria-label="Choose story"
          data-testid="story-picker-button"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
          </svg>
        </button>
        <span className="max-w-[320px] truncate font-medium">
          {loading
            ? "Loading..."
            : selectedSlug
              ? `${selectedItem?.title ?? selectedSlug} (${selectedSlug})`
              : "No story selected"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <details className="relative">
          <summary className={`shell-link cursor-pointer list-none px-2 py-1 flex items-center gap-1.5 ${disabledLinkClass}`} title="Navigate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span className="text-[11px] font-medium">{activeNavItem?.label ?? "Pipelines"}</span>
          </summary>
          <div className="absolute right-0 z-50 mt-1 min-w-[220px] rounded border border-[#2a3441] bg-[#0d1524] p-1 shadow-lg">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`block rounded px-2 py-1 hover:bg-[#162236] ${
                  pathname.includes(item.match) ? "bg-[#162236] text-[#cfe7ff]" : ""
                } ${!selectedSlug ? "pointer-events-none opacity-50" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>

        <details className="relative">
          <summary className={`shell-link cursor-pointer list-none px-2 py-1 flex items-center gap-1.5 ${disabledLinkClass}`} title="Controls">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span className="text-[11px] font-medium">Controls</span>
          </summary>
          <div className="absolute right-0 z-50 mt-1 min-w-[320px] rounded border border-[#2a3441] bg-[#0d1524] p-2 shadow-lg">
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left hover:bg-[#162236] disabled:pointer-events-none disabled:opacity-50"
              disabled={switchDisabled}
              onClick={() => saveWritingLanguage(writingLanguage === "en" ? "vi" : "en")}
            >
              Language: {writingLanguage === "en" ? "English" : "Tiếng Việt"}
            </button>
            <LlmProviderSelector />
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left hover:bg-[#162236] disabled:pointer-events-none disabled:opacity-50"
              disabled={actionsDisabled}
              onClick={() => {
                setShowLibrary(true);
              }}
            >
              Switch Story
            </button>
            {moreItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`block rounded px-2 py-1 hover:bg-[#162236] ${
                  !selectedSlug ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      </div>

      <button
        type="button"
        className="rounded-md border border-[#2f5b58] bg-[#133a37] px-2 py-1 transition hover:border-[#3e867f] disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1"
        onClick={() => {
          setFormError(null);
          setShowNew(true);
        }}
        disabled={actionsDisabled}
        title="New Story"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-tight text-[#8ef2d5]">Story</span>
      </button>

      {portalReady &&
        showLibrary &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" data-testid="story-picker-modal">
            <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#223247] bg-[#0f1722] p-4 text-white">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Choose Story</div>
                  <div className="muted text-xs">Pick a book and continue writing in the chat workspace.</div>
                </div>
                <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => setShowLibrary(false)}>
                  Close
                </button>
              </div>
              <div className="grid gap-2">
                {loading ? <div className="muted text-sm">Loading stories...</div> : null}
                {!loading && items.length === 0 ? <div className="quiet-empty-state p-3 text-sm">No stories yet.</div> : null}
                {items.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    data-testid={`story-picker-option-${item.slug}`}
                    className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-left transition hover:border-[#3e867f] hover:bg-[#162236] ${
                      item.slug === selectedSlug ? "border-[#3e867f] bg-[#133a37]" : "border-[#223247] bg-[#0d1524]"
                    }`}
                    onClick={() => {
                      setStorySlug(item.slug);
                      setShowLibrary(false);
                      router.push(`/stories/${encodeURIComponent(item.slug)}/write`);
                      router.refresh();
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.title || item.slug}</span>
                      <span className="muted block truncate text-xs">{item.slug}</span>
                    </span>
                    <span className="status-pill status-pill--drafting">{item.status}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="primary-action px-3 py-2 text-xs"
                  onClick={() => {
                    setShowLibrary(false);
                    setFormError(null);
                    setShowNew(true);
                  }}
                >
                  New story
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {portalReady &&
        showNew &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#223247] bg-[#0f1722] p-4 text-white">
              <div className="mb-3">
                <div className="text-base font-semibold">Create Story</div>
                <div className="muted text-xs">Create slug and title first. Advanced config is optional.</div>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <input
                    className="shell-control px-3 py-2"
                    placeholder="slug (a-z0-9_)"
                    value={form.slug}
                    onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                  />
                  <div className="muted text-xs">Example: the_subcurrent (lowercase, numbers, underscore only)</div>
                </div>
                <div className="grid gap-1">
                  <input
                    className="shell-control px-3 py-2"
                    placeholder="title"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                  <div className="muted text-xs">Example: The Subcurrent</div>
                </div>
                <div className="grid gap-1">
                  <select
                    className="shell-control px-3 py-2"
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, status: (e.target.value as "ACTIVE" | "DRAFT") ?? "ACTIVE" }))
                    }
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                  <div className="muted text-xs">Use ACTIVE for normal writing. Use DRAFT for private setup only.</div>
                </div>

                <details>
                  <summary className="cursor-pointer text-sm opacity-80">Advanced</summary>
                  <div className="mt-2 grid gap-2">
                    <div className="muted text-xs">Optional. Keep empty or {"{}"} if you do not need custom AI settings.</div>
                    <textarea
                      className="shell-control min-h-24 px-3 py-2"
                      placeholder="system_prompt (optional): Write in cinematic technical tone, avoid melodrama."
                      value={form.systemPrompt}
                      onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                    />
                    <textarea
                      className="shell-control min-h-24 px-3 py-2 font-mono text-xs"
                      placeholder='tone_profile_json JSON object, ex: {"voice":"grim_sci_fi","pacing":"medium"}'
                      value={form.toneProfileJson}
                      onChange={(e) => setForm((prev) => ({ ...prev, toneProfileJson: e.target.value }))}
                    />
                    <textarea
                      className="shell-control min-h-24 px-3 py-2 font-mono text-xs"
                      placeholder='default_llm_params_json JSON object, ex: {"temperature":0.7,"top_p":0.9}'
                      value={form.defaultLlmParamsJson}
                      onChange={(e) => setForm((prev) => ({ ...prev, defaultLlmParamsJson: e.target.value }))}
                    />
                  </div>
                </details>

                {formError && <div className="text-sm text-red-300">{formError}</div>}

                <div className="mt-1 flex justify-end gap-2">
                  <button
                    type="button"
                    className="shell-link px-3 py-2"
                    onClick={() => setShowNew(false)}
                    disabled={submitting || headerBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#2f5b58] bg-[#133a37] px-3 py-2 text-[#8ef2d5]"
                    onClick={submitCreateStory}
                    disabled={submitting || headerBusy}
                  >
                    {submitting ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
