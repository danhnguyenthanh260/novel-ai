import Link from "next/link";
import RootStoryBootstrap from "@/app/RootStoryBootstrap";
import WriteTabClient from "@/features/scenes/components/WriteTabClient";
import { listStories } from "@/features/scenes/server/workflow/repoStory";
import { pool } from "@/server/db/pool";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const stories = await listStories(pool);
    const storySlug = stories[0]?.slug;

    if (!storySlug) {
      return <RootStoryBootstrap />;
    }

    return <WriteTabClient storySlug={storySlug} />;
  } catch (error) {
    console.error("ROOT_STUDIO_BOOTSTRAP_FAILED", error);
    return <RootDatabaseRecovery />;
  }
}

function RootDatabaseRecovery() {
  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[var(--bg-app)] px-6 py-10 text-[var(--text-primary)]">
      <section className="w-full max-w-3xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <p className="muted text-[10px] font-semibold uppercase tracking-[0.18em]">Studio Bootstrap</p>
            <h1 className="mt-2 text-lg font-semibold">Workspace unavailable</h1>
          </div>
          <span className="status-pill status-pill--blocked">DB offline</span>
        </div>

        <div className="grid gap-4 text-sm leading-6 text-[var(--text-secondary)]">
          <p>
            Novel Lab could not load story metadata from PostgreSQL. The write workspace is paused so it does not open
            against a placeholder story.
          </p>
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-2)]">Recovery</div>
            <div className="mt-2 grid gap-1 text-xs">
              <span>Confirm `DATABASE_URL` targets the local Studio database.</span>
              <span>Start `novel_pg` before opening the write workspace.</span>
              <span>Reload this page after the database is reachable.</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/" className="primary-action">
            Retry
          </Link>
          <Link href="/shelf" className="shell-link px-3 py-2">
            Story Shelf
          </Link>
        </div>
      </section>
    </main>
  );
}
