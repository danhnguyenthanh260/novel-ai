"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const SLUG_RE = /^[a-z0-9_]+$/;

function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export default function RootStoryBootstrap() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = useMemo(() => {
    if (slugTouched) return slug.trim();
    return slugFromTitle(title);
  }, [slug, slugTouched, title]);

  async function submitCreateStory() {
    const cleanTitle = title.trim();
    const cleanSlug = effectiveSlug;
    setError(null);

    if (!cleanTitle) {
      setError("Title is required.");
      return;
    }

    if (!cleanSlug || !SLUG_RE.test(cleanSlug)) {
      setError("Slug must use lowercase letters, numbers, or underscore.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: cleanSlug,
          title: cleanTitle,
          status: "ACTIVE",
          system_prompt: null,
          tone_profile_json: {},
          default_llm_params_json: {},
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setError("Slug already exists.");
        return;
      }
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `CREATE_FAILED_${res.status}`);
        return;
      }

      router.push(`/stories/${encodeURIComponent(cleanSlug)}/pipelines`);
      router.refresh();
    } catch {
      setError("CREATE_FAILED");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[var(--bg-app)] px-6 py-10 text-[var(--text-primary)]">
      <section className="grid w-full max-w-5xl grid-cols-1 border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-[var(--border-subtle)] p-6 lg:border-b-0 lg:border-r">
          <p className="muted text-[10px] font-semibold uppercase tracking-[0.18em]">Studio Bootstrap</p>
          <h1 className="mt-3 text-lg font-semibold">Create the first story</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
            The Studio database is reachable, but no story exists yet. Create a story shell first, then continue into
            the pipeline setup workspace.
          </p>
          <div className="mt-5 grid gap-2 text-xs text-[var(--text-secondary)]">
            <span className="status-pill status-pill--partial w-fit">No story selected</span>
            <span>Next workspace: Pipelines</span>
            <span>Write workspace opens after a real story slug exists.</span>
          </div>
        </div>

        <form
          className="grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submitCreateStory();
          }}
        >
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Title</span>
            <input
              data-testid="story-title-input"
              className="shell-control px-3 py-2"
              placeholder="The Subcurrent"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Slug</span>
            <input
              data-testid="story-slug-input"
              className="shell-control px-3 py-2 font-mono text-xs"
              placeholder="the_subcurrent"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              disabled={submitting}
            />
            <span className="muted text-xs">Lowercase letters, numbers, and underscore only.</span>
          </label>

          {error && (
            <div data-testid="story-create-error" className="border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button data-testid="story-create-submit" type="submit" className="primary-action" disabled={submitting}>
              {submitting ? "Creating..." : "Create Story"}
            </button>
            <button
              type="button"
              className="shell-link px-3 py-2"
              onClick={() => router.push("/shelf")}
              disabled={submitting}
            >
              Story Shelf
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
