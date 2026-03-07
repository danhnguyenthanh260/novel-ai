import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

type WorkerState = "started" | "already_running" | "disabled" | "stopped" | "not_running" | "error";

export type WorkerEnsureResult = {
  state: WorkerState;
  pid: number | null;
  detail?: string;
};

export type WorkerStatusResult = {
  enabled: boolean;
  running: boolean;
  pid: number | null;
  detail?: string;
};

export type LlamaEnsureResult = {
  state: "started" | "already_running" | "stopped" | "not_running" | "error";
  pid: number | null;
  detail?: string;
};

export type LlamaStatusResult = {
  running: boolean;
  pid: number | null;
  detail?: string;
};

export type WorkerLane = "split" | "analysis" | "writing" | "all";

export type WorkerLaneStatus = {
  lane: WorkerLane;
  running: boolean;
  pid: number | null;
};

function isEnabled(): boolean {
  const raw = (process.env.INGEST_AUTO_START_WORKER ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function resolveRepoRoot(): string {
  let dir = process.cwd();
  while (true) {
    const hasStudio = fs.existsSync(path.join(dir, "apps", "studio"));
    const hasServices = fs.existsSync(path.join(dir, "services", "memory-bridge"));
    if (hasStudio || hasServices) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(process.cwd(), "..", "..");
}

function resolvePidFile(repoRoot: string): string {
  const custom = (process.env.MEMORY_WORKER_PID_FILE ?? "").trim();
  if (custom) return custom;
  return path.join(repoRoot, ".runtime", "memory_worker.pid");
}

function resolveLanePidFile(repoRoot: string, lane: WorkerLane): string {
  return path.join(repoRoot, ".runtime", `memory_worker_${lane}.pid`);
}

function resolveLlamaPidFile(repoRoot: string): string {
  const custom = (process.env.LLAMA_SERVER_PID_FILE ?? "").trim();
  if (custom) return custom;
  return path.join(repoRoot, ".runtime", "llama_server.pid");
}

function expandHomePath(value: string): string {
  const raw = value.trim();
  if (!raw.startsWith("~")) return raw;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (!home) return raw;
  if (raw === "~") return home;
  if (raw.startsWith("~/")) return path.join(home, raw.slice(2));
  return raw;
}

function resolveLlamaServerBin(): string {
  const custom = (process.env.LLAMA_SERVER_BIN ?? "").trim();
  if (custom) return expandHomePath(custom);
  return expandHomePath("~/llama.cpp/build/bin/llama-server");
}

function resolveLlamaModelPath(): string {
  const custom = (process.env.LLAMA_MODEL_PATH ?? "").trim();
  if (custom) return expandHomePath(custom);
  return expandHomePath("~/models/qwen2.5-7b/model.gguf");
}

async function isLlamaHttpReady(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function findLlamaPidByPort(port: number): number | null {
  try {
    const probe = spawnSync("bash", ["-lc", `pgrep -f "llama-server.*--port ${port}" | head -n 1`], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    const text = String(probe.stdout || "").trim();
    const pid = Number(text.split(/\s+/)[0] || 0);
    return Number.isFinite(pid) && pid > 0 ? Math.floor(pid) : null;
  } catch {
    return null;
  }
}

function resolvePythonBin(repoRoot: string): string {
  const custom = (process.env.MEMORY_WORKER_PYTHON ?? "").trim();
  if (custom) return custom;
  const venvPython = path.join(repoRoot, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) return venvPython;
  return "python3";
}

function resolveWorkerScript(repoRoot: string): string {
  const custom = (process.env.MEMORY_WORKER_SCRIPT ?? "").trim();
  if (custom) return custom;
  const candidates = [
    path.join(repoRoot, "services", "memory-bridge", "memory_bridge_worker.py"),
    path.join(repoRoot, "app", "memory_bridge_worker.py"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return candidates[0];
}

function readPid(pidFile: string): number | null {
  try {
    if (!fs.existsSync(pidFile)) return null;
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return Math.floor(pid);
  } catch {
    return null;
  }
}

function writePid(pidFile: string, pid: number): void {
  ensureDir(path.dirname(pidFile));
  fs.writeFileSync(pidFile, `${pid}\n`, "utf8");
}

function removePidFile(pidFile: string): void {
  try {
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  } catch {
    // ignore
  }
}

function runScript(repoRoot: string, scriptPath: string, args: string[] = []): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const child = spawn("bash", [scriptPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => chunks.push(String(d)));
    child.stderr.on("data", (d) => chunks.push(String(d)));
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: chunks.join("").trim() });
    });
  });
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessAlive(pid);
}

function sweepProcesses(pattern: string): void {
  try {
    // Aggressive cleanup: kill any processes matching the pattern that survived
    spawnSync("bash", ["-lc", `pkill -9 -f "${pattern}"`], {
      stdio: "ignore",
    });
  } catch {
    // ignore
  }
}

function resolveContext(): {
  repoRoot: string;
  pidFile: string;
  dsn: string;
  pythonBin: string;
  workerScript: string;
} {
  const repoRoot = resolveRepoRoot();
  const pidFile = resolvePidFile(repoRoot);
  const dsn = (process.env.DB_DSN ?? process.env.DATABASE_URL ?? "").trim();
  const pythonBin = resolvePythonBin(repoRoot);
  const workerScript = resolveWorkerScript(repoRoot);
  return { repoRoot, pidFile, dsn, pythonBin, workerScript };
}

export async function getWorkerLaneStatus(lane: WorkerLane): Promise<WorkerLaneStatus> {
  const { repoRoot } = resolveContext();
  const pidFile = resolveLanePidFile(repoRoot, lane);
  const pid = readPid(pidFile);
  const running = Boolean(pid && isProcessAlive(pid));
  return { lane, running, pid: running ? pid : null };
}

export async function getAllWorkerLaneStatuses(): Promise<WorkerLaneStatus[]> {
  const lanes: WorkerLane[] = ["split", "analysis", "writing", "all"];
  const result: WorkerLaneStatus[] = [];
  for (const lane of lanes) {
    result.push(await getWorkerLaneStatus(lane));
  }
  return result;
}

export async function startWorkerLane(lane: WorkerLane): Promise<WorkerEnsureResult> {
  const { repoRoot } = resolveContext();
  const script = path.join(repoRoot, "scripts", "ops", "run_worker_lane.sh");
  if (!fs.existsSync(script)) {
    return { state: "error", pid: null, detail: "RUN_WORKER_LANE_SCRIPT_NOT_FOUND" };
  }
  const exec = await runScript(repoRoot, script, [lane]);
  const status = await getWorkerLaneStatus(lane);
  if (status.running && status.pid) {
    return { state: "started", pid: status.pid, detail: exec.output || undefined };
  }
  return { state: exec.ok ? "error" : "error", pid: null, detail: exec.output || "WORKER_LANE_START_FAILED" };
}

export async function stopWorkerLane(lane: WorkerLane): Promise<WorkerEnsureResult> {
  const { repoRoot } = resolveContext();
  const pidFile = resolveLanePidFile(repoRoot, lane);
  const pid = readPid(pidFile);
  if (!pid || !isProcessAlive(pid)) {
    removePidFile(pidFile);
    return { state: "not_running", pid: null, detail: "WORKER_LANE_NOT_RUNNING" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return { state: "error", pid, detail: "WORKER_LANE_STOP_FAILED" };
  }
  const stopped = await waitForExit(pid, 3000);
  if (!stopped) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return { state: "error", pid, detail: "WORKER_LANE_FORCE_STOP_FAILED" };
    }
  }
  removePidFile(pidFile);
  sweepProcesses(`memory_bridge_worker.py.*--dsn.*WORKER_FLOW_LANE=${lane}`);
  return { state: "stopped", pid: null, detail: "WORKER_LANE_STOPPED" };
}

export async function restartWorkerLane(lane: WorkerLane): Promise<WorkerEnsureResult> {
  await stopWorkerLane(lane);
  return startWorkerLane(lane);
}

export async function startAllWorkerLanes(): Promise<WorkerEnsureResult> {
  const { repoRoot } = resolveContext();
  const script = path.join(repoRoot, "scripts", "ops", "run_worker_lanes.sh");
  if (!fs.existsSync(script)) {
    return { state: "error", pid: null, detail: "RUN_WORKER_LANES_SCRIPT_NOT_FOUND" };
  }
  const exec = await runScript(repoRoot, script);
  const lanes = await getAllWorkerLaneStatuses();
  const runningCount = lanes.filter((x) => x.running).length;
  return {
    state: runningCount > 0 ? "started" : "error",
    pid: null,
    detail: exec.output || `RUNNING_LANES:${runningCount}`,
  };
}

export async function stopAllWorkerLanes(): Promise<WorkerEnsureResult> {
  const { repoRoot } = resolveContext();
  const script = path.join(repoRoot, "scripts", "ops", "stop_worker_lanes.sh");
  if (fs.existsSync(script)) {
    const exec = await runScript(repoRoot, script);
    return { state: "stopped", pid: null, detail: exec.output || "ALL_LANES_STOPPED" };
  }
  for (const lane of ["split", "analysis", "writing", "all"] as WorkerLane[]) {
    await stopWorkerLane(lane);
  }
  return { state: "stopped", pid: null, detail: "ALL_LANES_STOPPED" };
}

export async function getIngestWorkerStatus(): Promise<WorkerStatusResult> {
  const enabled = isEnabled();

  const { pidFile } = resolveContext();
  const pid = readPid(pidFile);
  const running = Boolean(pid && isProcessAlive(pid));
  return {
    enabled,
    running,
    pid: running ? pid : null,
    detail: enabled ? undefined : "INGEST_AUTO_START_WORKER_DISABLED",
  };
}

export async function stopIngestWorker(): Promise<WorkerEnsureResult> {
  const { pidFile } = resolveContext();
  const pid = readPid(pidFile);
  if (!pid || !isProcessAlive(pid)) {
    removePidFile(pidFile);
    return { state: "not_running", pid: null, detail: "WORKER_NOT_RUNNING" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return { state: "error", pid: null, detail: "WORKER_STOP_FAILED" };
  }
  const stoppedGracefully = await waitForExit(pid, 3000);
  if (stoppedGracefully) {
    removePidFile(pidFile);
    return { state: "stopped", pid: null, detail: "WORKER_STOPPED" };
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return { state: "error", pid, detail: "WORKER_FORCE_STOP_FAILED" };
  }
  const stoppedForced = await waitForExit(pid, 1000);
  if (!stoppedForced) {
    return { state: "error", pid, detail: "WORKER_FORCE_STOP_TIMEOUT" };
  }
  removePidFile(pidFile);
  sweepProcesses("memory_bridge_worker.py.*--dsn");
  return { state: "stopped", pid: null, detail: "WORKER_FORCE_STOPPED" };
}

export async function restartIngestWorker(): Promise<WorkerEnsureResult> {
  await stopIngestWorker();
  return ensureIngestWorkerRunning();
}

export async function killIngestWorker(): Promise<WorkerEnsureResult> {
  const { pidFile } = resolveContext();
  removePidFile(pidFile);
  sweepProcesses("memory_bridge_worker.py");
  return { state: "stopped", pid: null, detail: "WORKER_KILLED_FORCIBLY" };
}

export async function ensureIngestWorkerRunning(): Promise<WorkerEnsureResult> {
  if (!isEnabled()) {
    return { state: "disabled", pid: null, detail: "INGEST_AUTO_START_WORKER_DISABLED" };
  }

  const { repoRoot, pidFile, dsn, pythonBin, workerScript } = resolveContext();
  if (!dsn) {
    return { state: "error", pid: null, detail: "MISSING_DB_DSN_OR_DATABASE_URL" };
  }

  const existingPid = readPid(pidFile);
  if (existingPid && isProcessAlive(existingPid)) {
    return { state: "already_running", pid: existingPid };
  }

  if (!fs.existsSync(workerScript)) {
    return { state: "error", pid: null, detail: `WORKER_SCRIPT_NOT_FOUND:${workerScript}` };
  }

  let logFd: number | null = null;
  try {
    const logFile = path.join(repoRoot, ".runtime", "worker.log");
    ensureDir(path.dirname(logFile));
    logFd = fs.openSync(logFile, "a");

    const child = spawn("stdbuf", ["-i0", "-o0", "-e0", pythonBin, workerScript, "--dsn", dsn], {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        DB_DSN: dsn,
        PYTHONUNBUFFERED: "1",
      },
    });
    child.unref();
    const pid = Number(child.pid ?? 0);
    if (!Number.isFinite(pid) || pid <= 0) {
      return { state: "error", pid: null, detail: "WORKER_SPAWN_PID_INVALID" };
    }
    writePid(pidFile, Math.floor(pid));
    return { state: "started", pid: Math.floor(pid) };
  } catch (error: unknown) {
    return {
      state: "error",
      pid: null,
      detail: error instanceof Error ? error.message : "WORKER_SPAWN_FAILED",
    };
  } finally {
    if (logFd !== null) {
      try {
        fs.closeSync(logFd);
      } catch {
        // ignore
      }
    }
  }
}

export async function ensureLlamaServerRunning(): Promise<LlamaEnsureResult> {
  const { repoRoot } = resolveContext();
  const pidFile = resolveLlamaPidFile(repoRoot);
  const port = Math.max(1, Number(process.env.LLAMA_PORT ?? 8080) || 8080);
  const existingPid = readPid(pidFile);
  if (existingPid && isProcessAlive(existingPid)) {
    return { state: "already_running", pid: existingPid, detail: "LLAMA_SERVER_ALREADY_RUNNING" };
  }
  const byPortPid = findLlamaPidByPort(port);
  if (byPortPid && isProcessAlive(byPortPid)) {
    writePid(pidFile, byPortPid);
    return { state: "already_running", pid: byPortPid, detail: "LLAMA_SERVER_ALREADY_RUNNING_BY_PORT" };
  }
  const httpReady = await isLlamaHttpReady(port);
  if (httpReady) {
    const inferredPid = findLlamaPidByPort(port);
    if (inferredPid) {
      writePid(pidFile, inferredPid);
    }
    return {
      state: "already_running",
      pid: inferredPid,
      detail: inferredPid ? "LLAMA_SERVER_ALREADY_RUNNING_BY_PORT" : "LLAMA_SERVER_ALREADY_RUNNING_HEALTHY",
    };
  }

  const llamaBin = resolveLlamaServerBin();
  const modelPath = resolveLlamaModelPath();
  if (!fs.existsSync(llamaBin)) {
    return { state: "error", pid: null, detail: `LLAMA_SERVER_BIN_NOT_FOUND:${llamaBin}` };
  }
  if (!fs.existsSync(modelPath)) {
    return { state: "error", pid: null, detail: `LLAMA_MODEL_NOT_FOUND:${modelPath}` };
  }

  const ctx = Math.max(512, Number(process.env.LLAMA_CONTEXT ?? 8192) || 8192);
  const ngl = Number(process.env.LLAMA_NGL ?? 99) || 99;
  const args = ["-m", modelPath, "-c", String(ctx), "--port", String(port), "-ngl", String(ngl)];

  let logFd: number | null = null;
  try {
    const logFile = path.join(repoRoot, ".runtime", "llama_server.log");
    ensureDir(path.dirname(logFile));
    logFd = fs.openSync(logFile, "a");

    const child = spawn(llamaBin, args, {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env },
    });
    child.unref();
    const pid = Number(child.pid ?? 0);
    if (!Number.isFinite(pid) || pid <= 0) {
      return { state: "error", pid: null, detail: "LLAMA_SERVER_SPAWN_PID_INVALID" };
    }
    writePid(pidFile, Math.floor(pid));
    return { state: "started", pid: Math.floor(pid), detail: `LLAMA_SERVER_STARTED_PORT_${port}` };
  } catch (error: unknown) {
    return {
      state: "error",
      pid: null,
      detail: error instanceof Error ? error.message : "LLAMA_SERVER_SPAWN_FAILED",
    };
  } finally {
    if (logFd !== null) {
      try {
        fs.closeSync(logFd);
      } catch {
        // ignore
      }
    }
  }
}

export async function getLlamaServerStatus(): Promise<LlamaStatusResult> {
  const { repoRoot } = resolveContext();
  const pidFile = resolveLlamaPidFile(repoRoot);
  const port = Math.max(1, Number(process.env.LLAMA_PORT ?? 8080) || 8080);
  const pid = readPid(pidFile);
  const runningByPid = Boolean(pid && isProcessAlive(pid));
  if (runningByPid) {
    return {
      running: true,
      pid: pid ?? null,
      detail: "LLAMA_SERVER_RUNNING",
    };
  }

  // Manual-start fallback: if HTTP health is reachable, treat llama as running.
  const healthyByHttp = await isLlamaHttpReady(port);
  if (healthyByHttp) {
    const inferredPid = findLlamaPidByPort(port);
    if (inferredPid) {
      writePid(pidFile, inferredPid);
    }
    return {
      running: true,
      pid: inferredPid ?? null,
      detail: inferredPid ? "LLAMA_SERVER_RUNNING_BY_PORT" : "LLAMA_SERVER_RUNNING_HEALTHY",
    };
  }

  return {
    running: false,
    pid: null,
    detail: "LLAMA_SERVER_STOPPED",
  };
}

export async function stopLlamaServer(): Promise<LlamaEnsureResult> {
  const { repoRoot } = resolveContext();
  const pidFile = resolveLlamaPidFile(repoRoot);
  const pid = readPid(pidFile);
  if (!pid || !isProcessAlive(pid)) {
    removePidFile(pidFile);
    return { state: "not_running", pid: null, detail: "LLAMA_SERVER_NOT_RUNNING" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return { state: "error", pid, detail: "LLAMA_SERVER_STOP_FAILED" };
  }
  const stoppedGracefully = await waitForExit(pid, 3000);
  if (!stoppedGracefully) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return { state: "error", pid, detail: "LLAMA_SERVER_FORCE_STOP_FAILED" };
    }
    const stoppedForced = await waitForExit(pid, 1000);
    if (!stoppedForced) {
      return { state: "error", pid, detail: "LLAMA_SERVER_FORCE_STOP_TIMEOUT" };
    }
  }
  removePidFile(pidFile);
  return { state: "stopped", pid: null, detail: "LLAMA_SERVER_STOPPED" };
}

export async function getWorkerLogs(type: "worker" | "llama", lines: number = 200): Promise<{ logs: string; error?: string }> {
  const { repoRoot } = resolveContext();
  const logFile = path.join(repoRoot, ".runtime", type === "worker" ? "worker.log" : "llama_server.log");
  if (!fs.existsSync(logFile)) {
    return { logs: "" };
  }
  try {
    // Basic tail implementation for Node.js
    const stats = fs.statSync(logFile);
    const chunkSize = 64 * 1024; // 64KB
    const startPos = Math.max(0, stats.size - chunkSize);
    const fd = fs.openSync(logFile, "r");
    const buffer = Buffer.alloc(stats.size - startPos);
    fs.readSync(fd, buffer, 0, buffer.length, startPos);
    fs.closeSync(fd);

    let content = buffer.toString("utf8");
    if (startPos > 0) {
      // Find first newline to avoid partial lines
      const firstNewline = content.indexOf("\n");
      if (firstNewline !== -1) content = content.slice(firstNewline + 1);
    }

    const allLines = content.split("\n");
    const tailLines = allLines.slice(-lines);
    return { logs: tailLines.join("\n") };
  } catch (err: unknown) {
    return { logs: "", error: err instanceof Error ? err.message : "WORKER_LOG_READ_FAILED" };
  }
}
