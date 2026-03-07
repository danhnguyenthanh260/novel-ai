"use client";

import { useEffect, useState, useRef } from "react";
import { fetchWorkerLogs } from "@/features/ingest/hooks/ingestJobsController/http";

type WorkerLogViewerProps = {
    baseUrl: string;
};

export function WorkerLogViewer({ baseUrl }: WorkerLogViewerProps) {
    const [logs, setLogs] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isFollowing, setIsFollowing] = useState(true);
    const preRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        let mounted = true;

        async function pollLogs() {
            try {
                const result = await fetchWorkerLogs(baseUrl, "worker", 100);
                if (mounted) {
                    setLogs(result);
                    setError(null);
                }
            } catch (err: any) {
                if (mounted) setError(err.message);
            }
        }

        pollLogs();
        const interval = setInterval(pollLogs, 3000); // Poll every 3 seconds

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [baseUrl]);

    useEffect(() => {
        if (isFollowing && preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight;
        }
    }, [logs, isFollowing]);

    return (
        <div className="surface-card flex flex-col p-3 mt-4 space-y-2">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Worker Logs</h2>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm muted cursor-pointer hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={isFollowing}
                            onChange={(e) => setIsFollowing(e.target.checked)}
                            className="rounded border-zinc-700 bg-zinc-900 text-purple-600 focus:ring-purple-600 focus:ring-offset-zinc-900"
                        />
                        Auto-scroll
                    </label>
                    <span className="text-xs muted">Polling every 3s</span>
                </div>
            </div>

            {error && <div className="text-red-400 text-xs">{error}</div>}

            <pre
                ref={preRef}
                className="h-64 overflow-y-auto rounded-md bg-black/50 p-3 text-xs font-mono text-zinc-300 ring-1 ring-inset ring-white/10"
                onScroll={(e) => {
                    const target = e.currentTarget;
                    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 10;
                    if (!isAtBottom && isFollowing) {
                        setIsFollowing(false);
                    } else if (isAtBottom && !isFollowing) {
                        setIsFollowing(true);
                    }
                }}
            >
                {logs || <span className="text-zinc-600 italic">Waiting for logs...</span>}
            </pre>
        </div>
    );
}
