"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultLlmProviderConfig,
  GROQ_MODEL_OPTIONS,
  LLM_PROVIDER_LABELS,
  type LlmHealthResult,
  type LlmProviderConfig,
  type LlmProviderKind,
  type RedactedLlmProviderConfig,
} from "../llmProviderProfiles";

type ProviderResponse = {
  provider?: RedactedLlmProviderConfig;
  error?: string;
};

type HealthResponse = {
  health?: LlmHealthResult;
  error?: string;
};

type ProviderForm = LlmProviderConfig & {
  apiKeyInput: string;
};

function formFromProvider(provider: RedactedLlmProviderConfig | null): ProviderForm {
  const defaults = defaultLlmProviderConfig(provider?.provider ?? "local");
  return {
    provider: provider?.provider ?? defaults.provider,
    baseUrl: provider?.baseUrl ?? defaults.baseUrl,
    model: provider?.model ?? defaults.model,
    apiKey: "",
    apiKeyInput: "",
    maxTokens: provider?.maxTokens ?? defaults.maxTokens,
  };
}

function useLlmProviderForm() {
  const [provider, setProvider] = useState<RedactedLlmProviderConfig | null>(null);
  const [form, setForm] = useState<ProviderForm>(() => formFromProvider(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<LlmHealthResult | null>(null);

  async function loadProvider() {
    setLoading(true);
    try {
      const res = await fetch("/api/llm/provider", { cache: "no-store" });
      const json = (await res.json()) as ProviderResponse;
      if (!res.ok || !json.provider) throw new Error(json.error ?? "LOAD_FAILED");
      setProvider(json.provider);
      setForm(formFromProvider(json.provider));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProvider();
  }, []);

  function selectProvider(next: LlmProviderKind) {
    const defaults = defaultLlmProviderConfig(next);
    setHealth(null);
    setMessage(null);
    setForm({ ...defaults, apiKey: "", apiKeyInput: "" });
  }

  async function saveProvider() {
    setSaving(true);
    setMessage(null);
    setHealth(null);
    try {
      const res = await fetch("/api/llm/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl,
          model: form.model,
          apiKey: form.apiKeyInput,
          maxTokens: form.maxTokens,
        }),
      });
      const json = (await res.json()) as ProviderResponse;
      if (!res.ok || !json.provider) throw new Error(json.error ?? "SAVE_FAILED");
      setProvider(json.provider);
      setForm({ ...formFromProvider(json.provider), apiKeyInput: "" });
      setMessage("Saved runtime provider.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  async function checkProvider() {
    setChecking(true);
    setMessage(null);
    setHealth(null);
    try {
      const res = await fetch("/api/llm/provider", { method: "POST" });
      const json = (await res.json()) as HealthResponse;
      if (!json.health) throw new Error(json.error ?? "HEALTH_CHECK_FAILED");
      setHealth(json.health);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "HEALTH_CHECK_FAILED");
    } finally {
      setChecking(false);
    }
  }

  return { provider, form, setForm, loading, saving, checking, message, health, selectProvider, saveProvider, checkProvider };
}

function ProviderFields({
  form,
  setForm,
  provider,
  selectProvider,
}: {
  form: ProviderForm;
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>;
  provider: RedactedLlmProviderConfig | null;
  selectProvider: (next: LlmProviderKind) => void;
}) {
  const modelOptions = useMemo(() => (form.provider === "groq" ? GROQ_MODEL_OPTIONS : []), [form.provider]);

  return (
    <div className="grid gap-2">
      <select
        className="shell-control px-2 py-1.5 text-xs"
        value={form.provider}
        onChange={(event) => selectProvider(event.target.value as LlmProviderKind)}
      >
        {(Object.keys(LLM_PROVIDER_LABELS) as LlmProviderKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {LLM_PROVIDER_LABELS[kind]}
          </option>
        ))}
      </select>
      <input
        className="shell-control px-2 py-1.5 text-xs"
        value={form.baseUrl}
        placeholder="OpenAI-compatible base URL"
        onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
      />
      <ModelInput form={form} modelOptions={modelOptions} setForm={setForm} />
      <div className="grid grid-cols-[1fr_76px] gap-2">
        <input
          className="shell-control px-2 py-1.5 text-xs"
          value={form.apiKeyInput}
          type="password"
          placeholder={provider?.hasApiKey ? "Keep existing key" : "API key"}
          onChange={(event) => setForm((prev) => ({ ...prev, apiKeyInput: event.target.value }))}
        />
        <input
          className="shell-control px-2 py-1.5 text-xs"
          value={form.maxTokens}
          type="number"
          min={64}
          max={4000}
          onChange={(event) => setForm((prev) => ({ ...prev, maxTokens: Number(event.target.value) }))}
        />
      </div>
    </div>
  );
}

function ModelInput({
  form,
  modelOptions,
  setForm,
}: {
  form: ProviderForm;
  modelOptions: readonly string[];
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>;
}) {
  if (modelOptions.length === 0) {
    return (
      <input
        className="shell-control px-2 py-1.5 text-xs"
        value={form.model}
        placeholder="model"
        onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
      />
    );
  }

  return (
    <select
      className="shell-control px-2 py-1.5 text-xs"
      value={form.model}
      onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
    >
      {modelOptions.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}

function getSourceLabel(source: RedactedLlmProviderConfig["source"] | undefined): string {
  if (source === "runtime") return "Runtime";
  if (source === "env") return "Env";
  return "Default";
}

function getHealthColor(status: LlmHealthResult["status"] | undefined): string {
  if (status === "ok") return "text-[#8ef2d5]";
  if (status === "rate_limited") return "text-amber-200";
  return "text-red-300";
}

function ProviderSummary({
  loading,
  provider,
}: {
  loading: boolean;
  provider: RedactedLlmProviderConfig | null;
}) {
  if (loading) return <div className="muted">Loading...</div>;
  return <div className="muted">{`${getSourceLabel(provider?.source)} · ${provider?.apiKeyPreview ?? "<missing>"}`}</div>;
}

export function LlmProviderSelector() {
  const state = useLlmProviderForm();
  const { provider, form, setForm, loading, saving, checking, message, health } = state;
  const healthColor = getHealthColor(health?.status);

  return (
    <div className="my-1 border-y border-[#223247] py-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-[#d9e7f7]">LLM Provider</div>
          <ProviderSummary loading={loading} provider={provider} />
        </div>
        <button
          type="button"
          className="rounded border border-[#2a3441] px-2 py-1 text-[#cfe7ff] hover:bg-[#162236]"
          onClick={state.checkProvider}
          disabled={loading || checking}
        >
          {checking ? "Checking" : "Check"}
        </button>
      </div>

      <ProviderFields form={form} provider={provider} selectProvider={state.selectProvider} setForm={setForm} />
      <button
        type="button"
        className="mt-2 w-full rounded-md border border-[#2f5b58] bg-[#133a37] px-2 py-1.5 text-left text-[#8ef2d5] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={state.saveProvider}
        disabled={saving || loading}
      >
        {saving ? "Saving provider..." : "Save runtime provider"}
      </button>

      {health && (
        <div className={`mt-2 ${healthColor}`}>
          {health.status}: {health.message}
          {typeof health.latencyMs === "number" ? ` (${health.latencyMs}ms)` : ""}
        </div>
      )}
      {message && <div className="mt-2 text-amber-200">{message}</div>}
    </div>
  );
}
