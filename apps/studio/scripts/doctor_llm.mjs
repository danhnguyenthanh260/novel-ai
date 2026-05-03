import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const verbose = args.has("--verbose");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function redact(value) {
  if (!value) return "<missing>";
  if (value === "local") return "local";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatBaseForLog(value) {
  if (!value) return "<missing>";
  if (!/^https?:\/\//i.test(value)) return "<invalid-url>";
  return value;
}

function validateBaseUrl(value) {
  if (!value) throw new Error("LLM_API_BASE is required");
  if (!/^https?:\/\//i.test(value)) throw new Error("LLM_API_BASE must start with http:// or https://");
}

function runtimeProviderPath() {
  return path.resolve(process.cwd(), "../../.runtime/llm-provider.json");
}

function loadRuntimeProvider() {
  const file = runtimeProviderPath();
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return {
    provider: String(parsed.provider || "custom_openai_compatible"),
    base: String(parsed.baseUrl || "").replace(/\/+$/, ""),
    apiKey: String(parsed.apiKey || ""),
    model: String(parsed.model || ""),
    maxTokens: Number(parsed.maxTokens || 64),
    source: "runtime",
  };
}

function parseJsonFromText(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM response was not JSON: ${trimmed.slice(0, 120)}`);
    return JSON.parse(match[0]);
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const runtimeProvider = loadRuntimeProvider();
  const base = runtimeProvider?.base || String(process.env.LLM_API_BASE || "http://localhost:8080/v1").replace(/\/+$/, "");
  const apiKey = runtimeProvider?.apiKey || String(process.env.LLM_API_KEY || "local");
  const model = runtimeProvider?.model || String(process.env.LLM_MODEL || "local-model");
  const maxTokens = runtimeProvider?.maxTokens || Number(process.env.LLM_MAX_TOKENS || 64);
  const healthMaxTokens = Math.min(Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 64, 64);

  console.log("[doctor:llm] source:", runtimeProvider?.source || (process.env.LLM_API_BASE ? "env" : "default"));
  if (runtimeProvider?.provider) console.log("[doctor:llm] provider:", runtimeProvider.provider);
  console.log("[doctor:llm] base:", formatBaseForLog(base));
  console.log("[doctor:llm] model:", model);
  console.log("[doctor:llm] api_key:", redact(apiKey));
  console.log("[doctor:llm] max_tokens:", healthMaxTokens);

  validateBaseUrl(base);
  if (!model) throw new Error("LLM_MODEL is required");
  if (!apiKey) throw new Error("LLM_API_KEY is required");

  if (dryRun) {
    console.log("[doctor:llm] dry_run=true; request not sent");
    return;
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: "Return JSON only: {\"ok\": true, \"provider\": \"configured\"}",
      },
    ],
    temperature: 0,
    max_tokens: healthMaxTokens,
  };

  const startedAt = performance.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const text = await res.text();

  if (!res.ok) {
    const hint =
      res.status === 429
        ? "Rate limited. Reduce max_tokens, wait for reset, or switch model/provider."
        : "Check LLM_API_BASE, LLM_API_KEY, LLM_MODEL, and provider availability.";
    throw new Error(`LLM health check failed: status=${res.status} latency_ms=${latencyMs} hint=${hint} body=${text.slice(0, 500)}`);
  }

  const json = JSON.parse(text);
  const content = json?.choices?.[0]?.message?.content;
  const parsed = parseJsonFromText(content);
  if (parsed?.ok !== true) {
    throw new Error(`LLM JSON response missing ok=true: ${JSON.stringify(parsed)}`);
  }

  console.log("[doctor:llm] status:", res.status);
  console.log("[doctor:llm] latency_ms:", latencyMs);
  console.log("[doctor:llm] response:", verbose ? content : JSON.stringify(parsed));
}

main().catch((err) => {
  console.error("[doctor:llm] failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
