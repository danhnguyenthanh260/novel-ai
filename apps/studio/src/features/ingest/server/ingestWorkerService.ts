import { NextRequest, NextResponse } from "next/server";
import {
  ensureIngestWorkerRunning,
  ensureLlamaServerRunning,
  getIngestWorkerStatus,
  getLlamaServerStatus,
  restartIngestWorker,
  killIngestWorker,
  stopLlamaServer,
  stopIngestWorker,
  getWorkerLogs,
  getAllWorkerLaneStatuses,
  restartWorkerLane,
  startAllWorkerLanes,
  startWorkerLane,
  stopAllWorkerLanes,
  stopWorkerLane,
  type WorkerLane,
} from "@/features/ingest/server/workerControl";
import { pool } from "@/server/db/pool";

const REQUIRED_READY_TABLES = [
  ["story_series", "story creation"],
  ["assistant_conversation", "chat persistence"],
  ["assistant_message", "chat messages"],
  ["ingest_job", "ingest jobs"],
  ["ingest_task", "ingest queue"],
] as const;

type IngestRuntimeReadiness = {
  ok: boolean;
  missing_tables: string[];
  checks: Array<{ table: string; ok: boolean; required_by: string }>;
  hint?: string;
  error?: string;
};

function isLlamaManualOnly(): boolean {
  const raw = (process.env.LLAMA_MANUAL_ONLY ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function migrationHint(missingTables: string[]): string | undefined {
  if (missingTables.length === 0) return undefined;
  return "Run: docker compose -f infra/docker-compose.yml up db-migrate";
}

async function getRuntimeReadiness(): Promise<IngestRuntimeReadiness> {
  try {
    const rows = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    const existing = new Set(rows.rows.map((row) => String(row.tablename)));
    const checks = REQUIRED_READY_TABLES.map(([table, requiredBy]) => ({
      table,
      ok: existing.has(table),
      required_by: requiredBy,
    }));
    const missingTables = checks.filter((check) => !check.ok).map((check) => check.table);
    return {
      ok: missingTables.length === 0,
      missing_tables: missingTables,
      checks,
      hint: migrationHint(missingTables),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      missing_tables: REQUIRED_READY_TABLES.map(([table]) => table),
      checks: REQUIRED_READY_TABLES.map(([table, requiredBy]) => ({
        table,
        ok: false,
        required_by: requiredBy,
      })),
      hint: "Start Postgres, then run: docker compose -f infra/docker-compose.yml up db-migrate",
      error: error instanceof Error ? error.message : "DB_READINESS_CHECK_FAILED",
    };
  }
}

async function getQueueMetrics(readiness?: IngestRuntimeReadiness) {
  const runtimeReadiness = readiness ?? await getRuntimeReadiness();
  if (!runtimeReadiness.ok) return {};
  const rows = await pool.query<{
    lane: string;
    status: string;
    count: string | number;
  }>(
    `
      WITH classified AS (
        SELECT
          CASE
            WHEN t.task_type IN ('CHAPTER_INGEST','CHAPTER_SPLIT_LLM','SCENE_CREATE','SPLIT_PROFILE_CORRECTION','CHAPTER_VALIDATE') THEN 'split'
            WHEN t.task_type IN ('WRITING_ANALYSIS') THEN 'analysis'
            WHEN t.task_type IN (
              'WRITING_PLANNING',
              'WRITING_PROSE',
              'WRITING_CONTINUITY',
              'WRITING_SUPERVISOR',
              'CHAPTER_WRITE_V3',
              'CHAPTER_LEDGER_EXTRACT',
              'MEMORY_ROLLUP_V3',
              'NARRATIVE_START',
              'NARRATIVE_STYLIST',
              'NARRATIVE_CRITIC',
              'NARRATIVE_REFINE',
              'NARRATIVE_FINALIZE'
            ) THEN 'writing'
            ELSE 'other'
          END AS lane,
          t.status
        FROM public.ingest_task t
      )
      SELECT lane, status, count(*)::bigint AS count
      FROM classified
      GROUP BY lane, status
    `
  );
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of rows.rows) {
    const lane = String(row.lane || "other");
    const status = String(row.status || "UNKNOWN");
    if (!matrix[lane]) matrix[lane] = {};
    matrix[lane][status] = Number(row.count || 0);
  }
  return matrix;
}

async function buildWorkerPayload() {
  const readiness = await getRuntimeReadiness();
  const worker = await getIngestWorkerStatus();
  const llama = await getLlamaServerStatus();
  const lanes = await getAllWorkerLaneStatuses();
  const queue = await getQueueMetrics(readiness);
  return { worker, lanes, queue, llama, readiness };
}

function asLane(raw: unknown): WorkerLane | null {
  const text = String(raw || "").trim().toLowerCase();
  if (text === "split" || text === "analysis" || text === "writing" || text === "all") return text;
  return null;
}

export async function getIngestWorkerResponse(): Promise<NextResponse> {
  const payload = await buildWorkerPayload();
  return NextResponse.json({ ok: true, ...payload });
}

export async function postIngestWorkerResponse(req: NextRequest): Promise<NextResponse> {
  let action = "start";
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
    action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "start";
  } catch {
    action = "start";
  }

  if (action === "status") {
    const payload = await buildWorkerPayload();
    return NextResponse.json({ ok: true, ...payload });
  }
  if (action === "start_lane") {
    const lane = asLane(body?.lane);
    if (!lane) return NextResponse.json({ ok: false, error: "INVALID_LANE" }, { status: 400 });
    const result = await startWorkerLane(lane);
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, lane, result, worker, lanes, queue, llama });
  }
  if (action === "stop_lane") {
    const lane = asLane(body?.lane);
    if (!lane) return NextResponse.json({ ok: false, error: "INVALID_LANE" }, { status: 400 });
    const result = await stopWorkerLane(lane);
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, lane, result, worker, lanes, queue, llama });
  }
  if (action === "restart_lane") {
    const lane = asLane(body?.lane);
    if (!lane) return NextResponse.json({ ok: false, error: "INVALID_LANE" }, { status: 400 });
    const result = await restartWorkerLane(lane);
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, lane, result, worker, lanes, queue, llama });
  }
  if (action === "start_all_lanes") {
    const result = await startAllWorkerLanes();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "stop_all_lanes") {
    const result = await stopAllWorkerLanes();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "restart_all_lanes") {
    const stop = await stopAllWorkerLanes();
    const start = await startAllWorkerLanes();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result: { stop, start }, worker, lanes, queue, llama });
  }
  if (action === "stop") {
    const result = await stopIngestWorker();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "restart") {
    const result = await restartIngestWorker();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "kill") {
    const result = await killIngestWorker();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "start_llama") {
    if (isLlamaManualOnly()) {
      return NextResponse.json(
        { ok: false, error: "LLAMA_MANUAL_ONLY", hint: "Start llama-server in a dedicated terminal." },
        { status: 409 }
      );
    }
    const result = await ensureLlamaServerRunning();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "stop_llama") {
    if (isLlamaManualOnly()) {
      return NextResponse.json(
        { ok: false, error: "LLAMA_MANUAL_ONLY", hint: "Stop llama-server manually from its terminal/process manager." },
        { status: 409 }
      );
    }
    const result = await stopLlamaServer();
    const worker = await getIngestWorkerStatus();
    const lanes = await getAllWorkerLaneStatuses();
    const queue = await getQueueMetrics();
    const llama = await getLlamaServerStatus();
    return NextResponse.json({ ok: true, action, result, worker, lanes, queue, llama });
  }
  if (action === "logs") {
    const type = body?.type === "llama" ? "llama" : "worker";
    const lines = typeof body?.lines === "number" ? body.lines : 200;
    const result = await getWorkerLogs(type, lines);
    return NextResponse.json({ ok: !result.error, action, logs: result.logs, error: result.error });
  }
  if (action !== "start") {
    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  }

  const result = await ensureIngestWorkerRunning();
  const worker = await getIngestWorkerStatus();
  const lanes = await getAllWorkerLaneStatuses();
  const queue = await getQueueMetrics();
  const llama = await getLlamaServerStatus();
  return NextResponse.json({ ok: true, action: "start", result, worker, lanes, queue, llama });
}
