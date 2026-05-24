/**
 * doctor_e2e_preflight.mjs
 *
 * Run all infrastructure checks required before executing the E2E suite.
 * Checks: Docker (optional), PostgreSQL, DB tables, Qdrant, Neo4j, Historian,
 *         Studio dev server, LLM config, and Playwright discovery.
 * Set E2E_REAL_LLM=1 to require a live OpenAI-compatible LLM call.
 *
 * Usage:
 *   node scripts/doctor_e2e_preflight.mjs [--verbose] [--fix-hints]
 *
 * Exit codes:
 *   0  READY or READY_WITH_WARNINGS
 *   1  BLOCKED (at least one required service unreachable)
 */

import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { Client } from "pg";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose");
const fixHints = args.has("--fix-hints");

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const DB_URL = process.env.DATABASE_URL || "postgresql://novel:novelpass@localhost:5433/novel";
const QDRANT_URL = process.env.HISTORIAN_QDRANT_URL || "http://localhost:6333";
const QDRANT_ENABLED = process.env.HISTORIAN_QDRANT_ENABLED === "1";
const NEO4J_HTTP_URL = (() => {
  const uri = process.env.HISTORIAN_NEO4J_URI || "bolt://localhost:7687";
  return uri.replace(/^bolt:\/\//, "http://").replace(":7687", ":7474");
})();
const NEO4J_ENABLED = process.env.HISTORIAN_NEO4J_ENABLED === "1";
const HISTORIAN_URL = process.env.HISTORIAN_MCP_BASE_URL || "http://localhost:8090";
const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const LLM_API_BASE = process.env.LLM_API_BASE || "";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "";
const E2E_REAL_LLM = process.env.E2E_REAL_LLM === "1";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** @typedef {{ label: string; status: "pass"|"warn"|"fail"|"skip"; detail: string; fix?: string }} CheckResult */

/** @type {CheckResult[]} */
const results = [];

function pass(label, detail) {
  results.push({ label, status: "pass", detail });
  console.log(`  ✓  ${label}: ${detail}`);
}

function warn(label, detail, fix) {
  results.push({ label, status: "warn", detail, fix });
  console.log(`  △  ${label}: ${detail}`);
  if (fix && fixHints) console.log(`     FIX: ${fix}`);
}

function fail(label, detail, fix) {
  results.push({ label, status: "fail", detail, fix });
  console.log(`  ✗  ${label}: ${detail}`);
  if (fix && fixHints) console.log(`     FIX: ${fix}`);
}

function skip(label, detail) {
  results.push({ label, status: "skip", detail });
  if (verbose) console.log(`  -  ${label}: ${detail}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function httpGet(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const t0 = performance.now();
    const res = await fetch(url, { signal: controller.signal });
    const latency = Math.round(performance.now() - t0);
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text, latency };
  } catch (err) {
    return { ok: false, status: 0, body: String(err?.message || err), latency: -1, error: err };
  } finally {
    clearTimeout(timer);
  }
}

async function tryShellCommand(cmd, args2) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args2, { timeout: 8000 });
    return { ok: true, output: (stdout + stderr).trim() };
  } catch (err) {
    return { ok: false, output: String(err?.message || err) };
  }
}

function redact(value) {
  if (!value) return "<missing>";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkDocker() {
  console.log("\n[docker]");
  const result = await tryShellCommand("docker", ["version", "--format", "Server: {{.Server.Version}}"]);
  if (result.ok && result.output.includes("Server:")) {
    pass("docker-server", result.output.replace(/\s+/g, " ").trim());
  } else {
    warn(
      "docker-server",
      "Docker CLI not found or Docker Desktop not running",
      "Start Docker Desktop on Windows → Settings → Resources → WSL Integration → enable your Ubuntu distro"
    );
  }

  const psResult = await tryShellCommand("docker", [
    "compose", "-f", path.resolve(process.cwd(), "../../infra/docker-compose.yml"), "ps", "--format", "table {{.Name}}\t{{.State}}\t{{.Ports}}"
  ]);
  if (psResult.ok) {
    const lines = psResult.output.split("\n").filter((l) => l.trim() && !l.startsWith("NAME"));
    if (lines.length === 0) {
      fail(
        "docker-compose-services",
        "No services running",
        "Run: docker compose -f infra/docker-compose.yml up -d"
      );
    } else {
      for (const line of lines) {
        const [name, state] = line.split(/\s+/);
        if (state === "running") pass(`compose:${name}`, "running");
        else fail(`compose:${name}`, `state=${state || "unknown"}`, `docker compose -f infra/docker-compose.yml up -d ${name}`);
      }
    }
  } else {
    warn("docker-compose-services", "Cannot read compose service status (docker not in PATH)");
  }
}

async function checkPostgres() {
  console.log("\n[postgresql]");
  if (verbose) console.log(`     DSN: ${DB_URL.replace(/:\/\/[^@]+@/, "://<credentials>@")}`);

  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
  try {
    const t0 = performance.now();
    await client.connect();
    const latency = Math.round(performance.now() - t0);
    const res = await client.query("SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port");
    const row = res.rows[0];
    pass("postgres-connect", `db=${row.db} user=${row.usr} port=${row.port} latency=${latency}ms`);
  } catch (err) {
    fail(
      "postgres-connect",
      `Connection refused: ${err.message}`,
      "Start Docker and run: docker compose -f infra/docker-compose.yml up -d novel_pg"
    );
    return;
  } finally {
    await client.end().catch(() => {});
  }

  await checkDbTables();
}

const REQUIRED_TABLES = [
  ["story_series", "story creation"],
  ["narrative_scene", "chapter draft storage"],
  ["chapter_draft", "AutoWrite output"],
  ["assistant_conversation", "chat persistence"],
  ["assistant_message", "timeline blocks"],
  ["ingest_job", "pipeline / ingest"],
  ["story_chapter", "chapter list"],
];

async function checkDbTables() {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const existing = new Set(res.rows.map((r) => r.tablename));
    const missing = [];
    for (const [table, reason] of REQUIRED_TABLES) {
      if (existing.has(table)) {
        if (verbose) pass(`table:${table}`, `exists (required by: ${reason})`);
      } else {
        missing.push(table);
        fail(
          `table:${table}`,
          `MISSING — required by ${reason}`,
          "Apply migrations: psql $DATABASE_URL -f db/migrations/000_baseline_20260502.sql"
        );
      }
    }
    if (missing.length === 0) pass("db-tables", `all ${REQUIRED_TABLES.length} required tables present`);

    // Count stories as a basic data sanity check
    const stories = await client.query("SELECT count(*)::int AS n FROM public.story_series");
    const n = stories.rows[0]?.n ?? 0;
    if (n > 0) pass("db-stories", `${n} story/stories in story_series`);
    else warn("db-stories", "story_series is empty — E2E beforeAll will create test stories");

    // Check for assistant_conversation table (added in delta migration)
    const convMigration = existing.has("assistant_conversation");
    if (convMigration) pass("db-migration-delta", "assistant_conversation table present (delta migration applied)");
    else fail("db-migration-delta", "assistant_conversation missing", "Apply: psql $DATABASE_URL -f db/migrations/20260508_assistant_conversation_history.sql");

  } catch (err) {
    fail("db-tables", `Query failed: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkQdrant() {
  console.log("\n[qdrant]");
  if (!QDRANT_ENABLED) {
    skip("qdrant", "HISTORIAN_QDRANT_ENABLED not set — semantic retrieval disabled (style_similarity=0.0 expected)");
    return;
  }
  const res = await httpGet(`${QDRANT_URL}/healthz`, 5000);
  if (res.ok || res.status === 200) {
    pass("qdrant-health", `reachable at ${QDRANT_URL} latency=${res.latency}ms`);
  } else if (res.status === 0) {
    // NOT a hard E2E blocker — E2E mocks the autowrite pipeline, so Qdrant is not called during tests
    warn(
      "qdrant-health",
      `Unreachable at ${QDRANT_URL} — HISTORIAN_QDRANT_ENABLED=1 but not running. style_similarity=0.0 in real pipeline runs. E2E tests use mocks so this does not block them.`,
      "Start: docker compose -f infra/docker-compose.yml up -d novel_qdrant"
    );
  } else {
    warn("qdrant-health", `Unexpected response status=${res.status} body=${res.body.slice(0, 80)}`);
  }
}

async function checkNeo4j() {
  console.log("\n[neo4j]");
  if (!NEO4J_ENABLED) {
    skip("neo4j", "HISTORIAN_NEO4J_ENABLED not set — lineage context disabled");
    return;
  }
  const res = await httpGet(`${NEO4J_HTTP_URL}`, 5000);
  if (res.ok || res.status === 200 || res.status === 401) {
    pass("neo4j-http", `reachable at ${NEO4J_HTTP_URL} status=${res.status} latency=${res.latency}ms`);
  } else if (res.status === 0) {
    // NOT a hard E2E blocker — E2E mocks the autowrite pipeline
    warn(
      "neo4j-http",
      `Unreachable at ${NEO4J_HTTP_URL} — lineage context absent in real pipeline runs. E2E mocks bypass Neo4j.`,
      "Start: docker compose -f infra/docker-compose.yml up -d novel_neo4j"
    );
  } else {
    warn("neo4j-http", `Unexpected response status=${res.status}`);
  }
}

async function checkHistorian() {
  console.log("\n[historian-bridge]");
  if (!HISTORIAN_URL) {
    skip("historian", "HISTORIAN_MCP_BASE_URL not set");
    return;
  }
  const res = await httpGet(`${HISTORIAN_URL}/healthz`, 5000);
  if (res.ok) {
    pass("historian-health", `reachable at ${HISTORIAN_URL} latency=${res.latency}ms`);
    if (verbose) console.log(`     body: ${res.body.slice(0, 120)}`);
  } else if (res.status === 0) {
    warn(
      "historian-health",
      `Connection refused at ${HISTORIAN_URL} — narrative_score context will be empty`,
      "Start: docker compose -f infra/docker-compose.yml up -d novel_historian_bridge"
    );
  } else {
    warn("historian-health", `status=${res.status} body=${res.body.slice(0, 80)}`);
  }
}

async function checkStudio() {
  console.log("\n[studio-dev-server]");
  const storiesUrl = `${E2E_BASE_URL}/api/stories`;
  const res = await httpGet(storiesUrl, 6000);
  if (res.ok) {
    let count = "?";
    try { count = JSON.parse(res.body)?.items?.length ?? "?"; } catch { /* ignore */ }
    pass("studio-api-stories", `reachable at ${E2E_BASE_URL} stories=${count} latency=${res.latency}ms`);
  } else if (res.status === 0) {
    fail(
      "studio-api-stories",
      `Dev server not running at ${E2E_BASE_URL}`,
      "Run in a separate terminal: cd apps/studio && npm run dev\n     Or set E2E_BASE_URL=http://localhost:3001 if using Docker port"
    );
  } else {
    warn("studio-api-stories", `Unexpected status=${res.status} body=${res.body.slice(0, 80)}`);
  }

  // Check the write workspace responds (basic route check)
  const writeRes = await httpGet(`${E2E_BASE_URL}/shelf`, 4000);
  if (writeRes.ok) pass("studio-shelf-page", `/shelf loads (status=${writeRes.status})`);
  else if (writeRes.status === 0) skip("studio-shelf-page", "dev server not running");
  else warn("studio-shelf-page", `status=${writeRes.status}`);
}

async function checkLlm() {
  console.log("\n[llm-config]");
  if (!LLM_API_BASE) {
    if (E2E_REAL_LLM) {
      fail(
        "llm-api-base",
        "LLM_API_BASE not set — real E2E requires a live local LLM endpoint",
        "Run: npm run e2e:start  or set LLM_API_BASE=http://localhost:8080/v1"
      );
      return;
    }
    warn("llm-api-base", "LLM_API_BASE not set — E2E uses page.route() mocks, real LLM not required for E2E");
    return;
  }
  if (!isUrl(LLM_API_BASE)) {
    const detail = `Not a URL: "${LLM_API_BASE.slice(0, 40)}" — looks like an API key was pasted into LLM_API_BASE.`;
    const fix = "Fix .env.local: LLM_API_BASE=http://localhost:8080/v1  and  LLM_API_KEY=local";
    if (E2E_REAL_LLM) {
      fail("llm-api-base", `${detail} Real E2E cannot run.`, fix);
      return;
    }
    warn(
      "llm-api-base",
      `${detail} Real pipeline writes will fail but mocked E2E is unaffected.`,
      fix
    );
    return;
  }
  pass("llm-api-base", `URL format OK: ${LLM_API_BASE}`);
  if (!LLM_API_KEY) {
    if (E2E_REAL_LLM) {
      fail("llm-api-key", "LLM_API_KEY not set — real E2E requires an API key value, use 'local' for llama.cpp", "Set LLM_API_KEY=local");
    } else {
      warn("llm-api-key", "LLM_API_KEY not set");
    }
  } else if (LLM_API_KEY === "local") {
    warn("llm-api-key", `LLM_API_KEY is "${LLM_API_KEY}" — fine for local endpoint, may fail for remote`);
  } else {
    pass("llm-api-key", `set (${redact(LLM_API_KEY)})`);
  }
  if (!LLM_MODEL) {
    if (E2E_REAL_LLM) {
      fail("llm-model", "LLM_MODEL not set — real E2E must declare the model under test", "Set LLM_MODEL=qwen2.5-7b");
    } else {
      warn("llm-model", "LLM_MODEL not set — will use provider default");
    }
  } else {
    pass("llm-model", LLM_MODEL);
  }
  if (!E2E_REAL_LLM) {
    skip("llm-live-call", "not tested here — set E2E_REAL_LLM=1 or run 'npm run doctor:llm'");
    return;
  }

  if (!LLM_API_KEY || !LLM_MODEL) return;

  const startedAt = performance.now();
  try {
    const res = await fetch(`${LLM_API_BASE.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: "user",
            content: "Return JSON only: {\"ok\": true, \"mode\": \"real_e2e\"}",
          },
        ],
        temperature: 0,
        max_tokens: 64,
      }),
    });
    const latency = Math.round(performance.now() - startedAt);
    const text = await res.text();
    if (!res.ok) {
      fail(
        "llm-live-call",
        `status=${res.status} latency=${latency}ms body=${text.slice(0, 180)}`,
        "Start the local llama.cpp server or check LLM_API_BASE, LLM_API_KEY, and LLM_MODEL"
      );
      return;
    }
    pass("llm-live-call", `chat/completions OK status=${res.status} latency=${latency}ms`);
    if (verbose) console.log(`     body: ${text.slice(0, 240)}`);
  } catch (err) {
    fail(
      "llm-live-call",
      `Request failed: ${err.message}`,
      "Run: npm run e2e:start"
    );
  }
}

async function checkPlaywright() {
  console.log("\n[playwright]");

  // Config file
  const configPath = path.resolve(process.cwd(), "playwright.config.ts");
  if (existsSync(configPath)) pass("playwright-config", "playwright.config.ts found");
  else fail("playwright-config", "playwright.config.ts missing", "Create apps/studio/playwright.config.ts");

  // Test directory
  const testDir = path.resolve(process.cwd(), "e2e/tests");
  if (existsSync(testDir)) pass("playwright-testdir", "e2e/tests/ found");
  else fail("playwright-testdir", "e2e/tests/ missing");

  // Test discovery
  const listResult = await tryShellCommand("npx", ["playwright", "test", "--list", "--reporter=list"]);
  if (listResult.ok) {
    const totalMatch = listResult.output.match(/Total:\s*(\d+)\s*test/i);
    const total = totalMatch ? parseInt(totalMatch[1]) : null;
    if (total !== null && total > 0) {
      pass("playwright-discovery", `${total} test(s) discovered`);
      if (verbose) {
        const lines = listResult.output.split("\n").filter((l) => l.includes("›")).slice(0, 10);
        for (const l of lines) console.log(`     ${l.trim()}`);
      }
    } else {
      warn("playwright-discovery", "No tests found in e2e/tests/");
    }
  } else {
    fail("playwright-discovery", `npx playwright test --list failed: ${listResult.output.slice(0, 200)}`);
  }

  // Chromium browser — check via known cache path pattern
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const chromiumCacheDir = path.join(homeDir, ".cache", "ms-playwright");
  const chromiumCheck = await tryShellCommand("ls", [chromiumCacheDir]);
  if (chromiumCheck.ok && (chromiumCheck.output.includes("chromium") || chromiumCheck.output.includes("chromium_headless_shell"))) {
    pass("playwright-chromium", `Chromium installed in ${chromiumCacheDir}`);
  } else {
    warn(
      "playwright-chromium",
      "Chromium browser not found in ~/.cache/ms-playwright",
      "Run: cd apps/studio && npx playwright install chromium"
    );
  }
}

// ---------------------------------------------------------------------------
// Main report
// ---------------------------------------------------------------------------

function printSummary() {
  const passes = results.filter((r) => r.status === "pass").length;
  const warns = results.filter((r) => r.status === "warn").length;
  const fails = results.filter((r) => r.status === "fail").length;
  const skips = results.filter((r) => r.status === "skip").length;

  const blockers = results.filter((r) => r.status === "fail");

  console.log("\n" + "═".repeat(62));
  console.log("  E2E PREFLIGHT SUMMARY");
  console.log("═".repeat(62));
  console.log(`  Pass:    ${passes}`);
  console.log(`  Warn:    ${warns}`);
  console.log(`  Fail:    ${fails}`);
  console.log(`  Skip:    ${skips}`);

  let verdict;
  if (fails > 0) {
    verdict = "BLOCKED";
  } else if (warns > 0) {
    verdict = "READY_WITH_WARNINGS";
  } else {
    verdict = "READY";
  }

  console.log(`\n  Verdict: ${verdict}`);

  if (blockers.length > 0) {
    console.log("\n  Blocking issues:");
    for (const b of blockers) {
      console.log(`    ✗  ${b.label}: ${b.detail}`);
      if (b.fix) console.log(`       Fix: ${b.fix}`);
    }
  }

  if (warns > 0) {
    const warnItems = results.filter((r) => r.status === "warn");
    console.log("\n  Warnings:");
    for (const w of warnItems) {
      console.log(`    △  ${w.label}: ${w.detail}`);
    }
  }

  console.log("═".repeat(62));
  if (!fixHints && fails > 0) console.log("  Tip: re-run with --fix-hints for remediation steps");
  console.log("");

  return verdict;
}

async function main() {
  console.log("[doctor:e2e_preflight] starting…");
  console.log(`  DB:         ${DB_URL.replace(/:\/\/[^@]+@/, "://<credentials>@")}`);
  console.log(`  E2E_BASE:   ${E2E_BASE_URL}`);
  console.log(`  Qdrant:     ${QDRANT_ENABLED ? QDRANT_URL : "disabled"}`);
  console.log(`  Neo4j:      ${NEO4J_ENABLED ? NEO4J_HTTP_URL : "disabled"}`);
  console.log(`  Historian:  ${HISTORIAN_URL || "not set"}`);
  console.log(`  Real LLM:   ${E2E_REAL_LLM ? "required" : "not required"}`);

  await checkDocker();
  await checkPostgres();
  await checkQdrant();
  await checkNeo4j();
  await checkHistorian();
  await checkStudio();
  await checkLlm();
  await checkPlaywright();

  const verdict = printSummary();
  process.exit(verdict === "BLOCKED" ? 1 : 0);
}

main().catch((err) => {
  console.error("[doctor:e2e_preflight] unexpected error:", err);
  process.exit(1);
});
