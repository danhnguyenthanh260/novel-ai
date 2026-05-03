export type LlmProviderKind = "local" | "groq" | "custom_openai_compatible";

export type LlmProviderConfig = {
  provider: LlmProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
};

export type RedactedLlmProviderConfig = Omit<LlmProviderConfig, "apiKey"> & {
  apiKeyPreview: string;
  hasApiKey: boolean;
  source: "runtime" | "env" | "default";
};

export type LlmHealthResult = {
  ok: boolean;
  status: "ok" | "failed" | "rate_limited";
  latencyMs?: number;
  provider: LlmProviderKind;
  baseUrl: string;
  model: string;
  message: string;
};

export const LLM_PROVIDER_LABELS: Record<LlmProviderKind, string> = {
  local: "Local API",
  groq: "Groq",
  custom_openai_compatible: "Custom API",
};

export const GROQ_MODEL_OPTIONS = [
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
] as const;

export const LOCAL_DEFAULT_BASE_URL = "http://localhost:8080/v1";
export const GROQ_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

const DEFAULT_MAX_TOKENS = 512;

export function defaultLlmProviderConfig(provider: LlmProviderKind): LlmProviderConfig {
  if (provider === "groq") {
    return {
      provider,
      baseUrl: GROQ_DEFAULT_BASE_URL,
      model: "llama-3.1-8b-instant",
      apiKey: "",
      maxTokens: DEFAULT_MAX_TOKENS,
    };
  }

  if (provider === "custom_openai_compatible") {
    return {
      provider,
      baseUrl: "",
      model: "",
      apiKey: "",
      maxTokens: DEFAULT_MAX_TOKENS,
    };
  }

  return {
    provider,
    baseUrl: LOCAL_DEFAULT_BASE_URL,
    model: "local-model",
    apiKey: "local",
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

export function isLlmProviderKind(value: unknown): value is LlmProviderKind {
  return value === "local" || value === "groq" || value === "custom_openai_compatible";
}

export function redactApiKey(value: string | undefined): string {
  if (!value) return "<missing>";
  if (value === "local") return "local";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeMaxTokens(value: unknown, fallback = DEFAULT_MAX_TOKENS): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.round(parsed), 64), 4000);
}

export function validateLlmProviderConfig(config: LlmProviderConfig): string | null {
  if (!isLlmProviderKind(config.provider)) return "Invalid provider.";
  if (!config.baseUrl) return "Base URL is required.";
  if (!/^https?:\/\//i.test(config.baseUrl)) return "Base URL must start with http:// or https://.";
  if (!config.model.trim()) return "Model is required.";
  if (!Number.isFinite(config.maxTokens) || config.maxTokens <= 0) return "Max tokens must be greater than zero.";
  return null;
}

export function toRedactedLlmProviderConfig(
  config: LlmProviderConfig,
  source: RedactedLlmProviderConfig["source"]
): RedactedLlmProviderConfig {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    maxTokens: config.maxTokens,
    apiKeyPreview: redactApiKey(config.apiKey),
    hasApiKey: Boolean(config.apiKey),
    source,
  };
}
