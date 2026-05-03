import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  defaultLlmProviderConfig,
  isLlmProviderKind,
  normalizeBaseUrl,
  normalizeMaxTokens,
  toRedactedLlmProviderConfig,
  validateLlmProviderConfig,
  type LlmHealthResult,
  type LlmProviderConfig,
  type LlmProviderKind,
  type RedactedLlmProviderConfig,
} from "../llmProviderProfiles";

type RuntimeFileShape = Partial<LlmProviderConfig>;

function getRuntimeDir(): string {
  if (process.env.NOVEL_RUNTIME_DIR) return process.env.NOVEL_RUNTIME_DIR;
  const cwd = process.cwd();
  const repoRoot = cwd.replace(/\\/g, "/").endsWith("/apps/studio") ? path.resolve(cwd, "../..") : cwd;
  return path.join(repoRoot, ".runtime");
}

export function getRuntimeProviderPath(): string {
  return path.join(getRuntimeDir(), "llm-provider.json");
}

function envProviderConfig(): LlmProviderConfig | null {
  const baseUrl = normalizeBaseUrl(process.env.LLM_API_BASE ?? "");
  const model = String(process.env.LLM_MODEL ?? "").trim();
  const apiKey = String(process.env.LLM_API_KEY ?? "");
  if (!baseUrl && !model && !apiKey) return null;
  if (!/^https?:\/\//i.test(baseUrl)) return null;

  const provider = baseUrl.includes("api.groq.com")
    ? "groq"
    : baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")
      ? "local"
      : "custom_openai_compatible";

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    maxTokens: normalizeMaxTokens(process.env.LLM_MAX_TOKENS, 512),
  };
}

function normalizeRuntimeConfig(input: RuntimeFileShape, fallbackProvider: LlmProviderKind = "local"): LlmProviderConfig {
  const provider = isLlmProviderKind(input.provider) ? input.provider : fallbackProvider;
  const defaults = defaultLlmProviderConfig(provider);
  return {
    provider,
    baseUrl: normalizeBaseUrl(String(input.baseUrl ?? defaults.baseUrl)),
    model: String(input.model ?? defaults.model).trim(),
    apiKey: typeof input.apiKey === "string" ? input.apiKey : defaults.apiKey,
    maxTokens: normalizeMaxTokens(input.maxTokens, defaults.maxTokens),
  };
}

export async function readRuntimeProviderConfig(): Promise<LlmProviderConfig | null> {
  try {
    const raw = await readFile(getRuntimeProviderPath(), "utf8");
    const parsed = JSON.parse(raw) as RuntimeFileShape;
    const config = normalizeRuntimeConfig(parsed);
    const validationError = validateLlmProviderConfig(config);
    if (validationError) throw new Error(`Invalid runtime LLM provider config: ${validationError}`);
    return config;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function getActiveLlmProviderConfig(): Promise<{
  config: LlmProviderConfig;
  redacted: RedactedLlmProviderConfig;
}> {
  const runtimeConfig = await readRuntimeProviderConfig();
  if (runtimeConfig) {
    return { config: runtimeConfig, redacted: toRedactedLlmProviderConfig(runtimeConfig, "runtime") };
  }

  const envConfig = envProviderConfig();
  if (envConfig) {
    return { config: envConfig, redacted: toRedactedLlmProviderConfig(envConfig, "env") };
  }

  const defaultConfig = defaultLlmProviderConfig("local");
  return { config: defaultConfig, redacted: toRedactedLlmProviderConfig(defaultConfig, "default") };
}

export async function writeRuntimeProviderConfig(input: RuntimeFileShape): Promise<RedactedLlmProviderConfig> {
  const fallbackProvider = isLlmProviderKind(input.provider) ? input.provider : "local";
  const current = await readRuntimeProviderConfig();
  const providerChanged = Boolean(current && current.provider !== fallbackProvider);
  const defaults = defaultLlmProviderConfig(fallbackProvider);
  const merged = normalizeRuntimeConfig(
    {
      ...current,
      ...input,
      apiKey:
        typeof input.apiKey === "string" && input.apiKey.length > 0
          ? input.apiKey
          : typeof current?.apiKey === "string" && !providerChanged
            ? current.apiKey
            : defaults.apiKey,
    },
    fallbackProvider
  );
  const validationError = validateLlmProviderConfig(merged);
  if (validationError) throw new Error(validationError);

  await mkdir(getRuntimeDir(), { recursive: true });
  await writeFile(getRuntimeProviderPath(), `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  return toRedactedLlmProviderConfig(merged, "runtime");
}

export async function runLlmProviderHealthCheck(config: LlmProviderConfig): Promise<LlmHealthResult> {
  const validationError = validateLlmProviderConfig(config);
  if (validationError) {
    return {
      ok: false,
      status: "failed",
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      message: validationError,
    };
  }

  if (!config.apiKey) {
    return {
      ok: false,
      status: "failed",
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      message: "API key is required for health checks.",
    };
  }

  const startedAt = performance.now();
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Return JSON only: {\"ok\": true, \"provider\": \"configured\"}" }],
        temperature: 0,
        max_tokens: Math.min(config.maxTokens, 64),
      }),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status === 429 ? "rate_limited" : "failed",
        latencyMs,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        message:
          res.status === 429
            ? "Rate limited. Reduce max_tokens, wait for reset, or switch model/provider."
            : `Provider returned ${res.status}: ${text.slice(0, 180)}`,
      };
    }

    return {
      ok: true,
      status: "ok",
      latencyMs,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      message: "Health check passed.",
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
