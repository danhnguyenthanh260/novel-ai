import Link from "next/link";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";

export const dynamic = "force-dynamic";

export default async function FeedbackHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    let storyId: number;
    try {
        storyId = await resolveStoryId(pool, slug);
    } catch (e) {
        return <div className="p-4 text-red-500">Story not found.</div>;
    }

    const rs = await pool.query<{
        id: string;
        chapter_id: string;
        strategy: string | null;
        rating: number;
        note: string | null;
        created_at: Date;
        created_by: string;
        structured_tags: string | null;
    }>(
        `
    SELECT id, chapter_id, strategy, rating, note, created_at, created_by, structured_tags
    FROM public.split_feedback
    WHERE story_id = $1
    ORDER BY created_at DESC
    LIMIT 100
    `,
        [storyId]
    );

    const rows = rs.rows;

    return (
        <div className="mx-auto max-w-4xl p-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Feedback History</h1>
                    <p className="mt-1 text-sm text-slate-400">
                        Supervisor learning logs and structured tags for{" "}
                        <Link href={`/stories/${slug}`} className="text-blue-400 hover:underline">
                            {slug}
                        </Link>
                        .
                    </p>
                </div>
                <Link
                    href={`/stories/${slug}`}
                    className="rounded border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d]"
                >
                    Back to Story
                </Link>
            </div>

            {rows.length === 0 ? (
                <div className="rounded border border-[#30363d] bg-[#0d1117] p-8 text-center text-slate-500">
                    No feedback entries found yet.
                </div>
            ) : (
                <div className="space-y-4">
                    {rows.map((r) => {
                        let tagsObj = null;
                        if (r.structured_tags) {
                            try {
                                tagsObj = typeof r.structured_tags === "string" ? JSON.parse(r.structured_tags) : r.structured_tags;
                            } catch (e) {
                                // ignore
                            }
                        }

                        return (
                            <div key={r.id} className="rounded border border-[#223247] bg-[#0c1322] p-4 text-sm">
                                <div className="mb-3 flex items-center justify-between border-b border-[#223247] pb-2 text-xs text-slate-400">
                                    <span>
                                        Chapter: <strong className="text-slate-200">{r.chapter_id}</strong>
                                        {r.strategy && <span className="ml-2 text-slate-500">({r.strategy})</span>}
                                    </span>
                                    <span>{new Date(r.created_at).toLocaleString()}</span>
                                </div>

                                <div className="mb-4">
                                    <div className="mb-1 font-semibold text-slate-400">Human Note:</div>
                                    <div className="rounded bg-[#161b22] p-2 text-slate-300">
                                        {r.note ? r.note : <em className="text-slate-500">Empty</em>}
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-1 font-semibold text-blue-400">Supervisor Digested:</div>
                                    {tagsObj ? (
                                        <div className="rounded border border-blue-900/30 bg-[#0f172a] p-3 text-slate-300">
                                            <ul className="list-disc space-y-1 pl-4">
                                                <li>
                                                    <span className="text-slate-500">Category:</span> {tagsObj.category || "Unknown"}
                                                </li>
                                                <li>
                                                    <span className="text-slate-500">Severity:</span>{" "}
                                                    <span
                                                        className={
                                                            tagsObj.severity === "system_rule" ? "font-semibold text-amber-400" : ""
                                                        }
                                                    >
                                                        {tagsObj.severity || "Unknown"}
                                                    </span>
                                                </li>
                                                {tagsObj.target_entity && (
                                                    <li>
                                                        <span className="text-slate-500">Target Entity:</span> {tagsObj.target_entity}
                                                    </li>
                                                )}
                                                {tagsObj.rule_inferred && (
                                                    <li>
                                                        <span className="text-slate-500">Inferred Rule:</span> {tagsObj.rule_inferred}
                                                    </li>
                                                )}
                                            </ul>
                                        </div>
                                    ) : (
                                        <div className="text-xs italic text-slate-500">No structured tags extracted (Legacy entry).</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
