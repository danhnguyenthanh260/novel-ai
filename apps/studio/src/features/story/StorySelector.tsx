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

  const routeStorySlug = (() => {
    const fromStories = pathname.match(/^\/stories\/([^/]+)/);
    if (fromStories?.[1]) return decodeURIComponent(fromStories[1]);
    const fromRead = pathname.match(/^\/read\/([^/]+)/);
    if (fromRead?.[1]) return decodeURIComponent(fromRead[1]);
    return null;
  })();

  useEffect(() => {
    if (!pathname.startsWith("/shelf")) return;
    if (storySlug !== "default") setStorySlug("default");
  }, [pathname, setStorySlug, storySlug]);

  const storyExists = items.some((i) => i.slug === storySlug);
  const selectedSlug =
    pathname.startsWith("/shelf")
      ? null
      : routeStorySlug && items.some((i) => i.slug === routeStorySlug)
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
        router.push(`/stories/${encodeURIComponent(slug)}/pipelines`);
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
  const storyLinkBase = selectedSlug ? `/stories/${selectedSlug}` : "/shelf";
  const navItems = useMemo(
    () => [
      { label: "Pipelines", href: selectedSlug ? `${storyLinkBase}/pipelines` : "/shelf", match: "/pipelines" },
      { label: "Ingest", href: selectedSlug ? `${storyLinkBase}/ingest` : "/shelf", match: "/ingest" },
      { label: "Write", href: selectedSlug ? `${storyLinkBase}/write` : "/shelf", match: "/write" },
      { label: "Analysis", href: selectedSlug ? `${storyLinkBase}/analysis` : "/shelf", match: "/analysis" },
      { label: "Memory", href: selectedSlug ? `${storyLinkBase}/memory` : "/shelf", match: "/memory" },
      { label: "Map", href: selectedSlug ? `${storyLinkBase}/map` : "/shelf", match: "/map" },
    ],
    [selectedSlug, storyLinkBase]
  );
  const moreItems = useMemo(
    () => [
      { label: "Agents", href: selectedSlug ? `${storyLinkBase}/agents` : "/shelf" },
      { label: "Reviews", href: selectedSlug ? `${storyLinkBase}/reviews` : "/shelf" },
      { label: "Feedback", href: selectedSlug ? `${storyLinkBase}/feedback` : "/shelf" },
      { label: "Settings", href: selectedSlug ? `${storyLinkBase}/settings` : "/shelf" },
      { label: "Story Shelf", href: "/shelf" },
    ],
    [selectedSlug, storyLinkBase]
  );
  const activeNavItem = useMemo(() => navItems.find((item) => pathname.includes(item.match)) ?? navItems[0], [navItems, pathname]);

  return (
    <div className="flex max-w-[calc(100vw-180px)] flex-wrap items-center justify-end gap-2 text-sm">
      <div className="shell-control flex min-w-0 items-center gap-2 px-2 py-1.5">
        <span className="muted hidden sm:inline">Story</span>
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
          <summary className={`shell-link cursor-pointer list-none px-2 py-1 ${disabledLinkClass}`}>
            Navigate: {activeNavItem?.label ?? "Pipelines"}
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
          <summary className={`shell-link cursor-pointer list-none px-2 py-1 ${disabledLinkClass}`}>Controls</summary>
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
                router.push("/shelf");
                router.refresh();
              }}
            >
              Switch Story
            </button>
            {moreItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`block rounded px-2 py-1 hover:bg-[#162236] ${
                  !selectedSlug && item.href !== "/shelf" ? "pointer-events-none opacity-50" : ""
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
        className="rounded-md border border-[#2f5b58] bg-[#133a37] px-2 py-1 text-sm text-[#8ef2d5] transition hover:border-[#3e867f] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          setFormError(null);
          setShowNew(true);
        }}
        disabled={actionsDisabled}
      >
        + New Story
      </button>

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
