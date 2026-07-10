import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getRuntimeProviderPath,
  writeRuntimeProviderConfig,
} from "./llmProviderRuntime";
import type { LlmProviderConfig } from "../llmProviderProfiles";

const originalRuntimeDir = process.env.NOVEL_RUNTIME_DIR;
let runtimeDir: string | undefined;

async function useIsolatedRuntimeDir(): Promise<void> {
  runtimeDir = await mkdtemp(path.join(tmpdir(), "novel-runtime-provider-"));
  process.env.NOVEL_RUNTIME_DIR = runtimeDir;
}

async function readStoredConfig(): Promise<LlmProviderConfig> {
  return JSON.parse(await readFile(getRuntimeProviderPath(), "utf8")) as LlmProviderConfig;
}

afterEach(async () => {
  if (runtimeDir) await rm(runtimeDir, { recursive: true, force: true });
  runtimeDir = undefined;

  if (originalRuntimeDir === undefined) delete process.env.NOVEL_RUNTIME_DIR;
  else process.env.NOVEL_RUNTIME_DIR = originalRuntimeDir;
});

describe("writeRuntimeProviderConfig", () => {
  it("drops the previous provider key and uses the new provider default", async () => {
    await useIsolatedRuntimeDir();
    await writeRuntimeProviderConfig({
      provider: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.1-8b-instant",
      apiKey: "old-groq-secret",
      maxTokens: 512,
    });

    const redacted = await writeRuntimeProviderConfig({
      provider: "local",
      baseUrl: "http://localhost:8080/v1",
      model: "local-model",
      apiKey: "",
      maxTokens: 512,
    });

    expect((await readStoredConfig()).apiKey).toBe("local");
    expect(redacted.apiKeyPreview).toBe("local");
    expect(redacted.hasApiKey).toBe(true);
  });

  it("preserves the current key when the provider is unchanged and the new key is blank", async () => {
    await useIsolatedRuntimeDir();
    await writeRuntimeProviderConfig({
      provider: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.1-8b-instant",
      apiKey: "existing-groq-secret",
      maxTokens: 512,
    });

    const redacted = await writeRuntimeProviderConfig({
      provider: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "qwen/qwen3-32b",
      apiKey: "",
      maxTokens: 1024,
    });

    expect((await readStoredConfig()).apiKey).toBe("existing-groq-secret");
    expect(redacted.hasApiKey).toBe(true);
  });
});
