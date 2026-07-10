import { describe, expect, it } from "vitest";
import {
  validateLlmProviderConfig,
  type LlmProviderConfig,
} from "./llmProviderProfiles";

function validConfig(overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig {
  return {
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    apiKey: "test-key",
    maxTokens: 512,
    ...overrides,
  };
}

describe("validateLlmProviderConfig", () => {
  it("requires a base URL", () => {
    expect(validateLlmProviderConfig(validConfig({ baseUrl: "" }))).toBe(
      "Base URL is required."
    );
  });

  it("rejects a base URL with an unsupported scheme", () => {
    expect(validateLlmProviderConfig(validConfig({ baseUrl: "ftp://example.com/v1" }))).toBe(
      "Base URL must start with http:// or https://."
    );
  });

  it("accepts a valid HTTP provider config", () => {
    expect(validateLlmProviderConfig(validConfig())).toBeNull();
  });

  it("requires a model", () => {
    expect(validateLlmProviderConfig(validConfig({ model: "   " }))).toBe(
      "Model is required."
    );
  });

  it.each([0, -1])("rejects non-positive max tokens: %s", (maxTokens) => {
    expect(validateLlmProviderConfig(validConfig({ maxTokens }))).toBe(
      "Max tokens must be greater than zero."
    );
  });
});
