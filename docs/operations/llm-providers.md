# LLM Provider Profiles

This document defines local/development LLM provider setup for OpenAI-compatible endpoints. It does not introduce paid billing, database-stored API keys, or a new provider lock-in.

## Existing Contract

The Studio and worker code already use these environment variables:

```env
LLM_API_BASE=http://localhost:8080/v1
LLM_API_KEY=local
LLM_MODEL=qwen2.5-7b
LLM_MAX_TOKENS=512
```

Any provider that exposes an OpenAI-compatible `/chat/completions` endpoint can be tested through this shape.

## Runtime Provider Selector

Studio exposes a local/dev provider selector in the top-bar `Controls` menu.

Supported profiles:

- `Local API`: OpenAI-compatible local endpoint, default `http://localhost:8080/v1`.
- `Groq`: OpenAI-compatible Groq endpoint, default `https://api.groq.com/openai/v1`.
- `Gemini`: OpenAI-compatible Gemini endpoint, default `https://generativelanguage.googleapis.com/v1beta/openai`.
- `9Router`: OpenAI-compatible local router endpoint, default `http://localhost:20128/v1`.
- `Custom API`: any OpenAI-compatible provider.

The selector writes a local override file:

```text
.runtime/llm-provider.json
```

This file is ignored by Git and may contain a real API key. Do not copy it into commits, issues, logs, or screenshots.

Runtime override precedence:

```text
1. .runtime/llm-provider.json
2. apps/studio/.env.local or apps/studio/.env
3. Local API default
```

The browser never receives the raw stored API key from `GET /api/llm/provider`; it only receives a redacted preview. Health checks run server-side through `POST /api/llm/provider`.

Local still uses the old OpenAI-compatible API path. It does not launch or call a llama binary directly.

## Groq Free/Developer Profile

Groq can be used for low-cost local testing because it exposes an OpenAI-compatible API.

```env
LLM_API_BASE=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_xxxxxxxxxxxxxxxxx
LLM_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
LLM_MAX_TOKENS=512
```

Do not commit real API keys. Keep `LLM_MAX_TOKENS` small for first tests and only opt into full chapter generation manually.

Groq limits are model-specific and may change. Check the Groq console before relying on the values below.

| Model | RPM | RPD | TPM | TPD | Use |
|---|---:|---:|---:|---:|---|
| `llama-3.1-8b-instant` | 30 | 14.4K | 6K | 500K | Frequent plumbing tests |
| `qwen/qwen3-32b` | 60 | 1K | 6K | 500K | General writing pipeline tests |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 30 | 1K | 30K | 500K | Context-heavy tests |
| `openai/gpt-oss-120b` | 30 | 1K | 8K | 200K | Reasoning spot checks |
| `llama-3.3-70b-versatile` | 30 | 1K | 12K | 100K | Prose/reasoning spot checks |

Definitions:

- `RPM`: requests per minute.
- `RPD`: requests per day.
- `TPM`: tokens per minute.
- `TPD`: tokens per day.

## Gemini OpenAI-Compatible Profile

Gemini can be used through Google's OpenAI-compatible chat completions endpoint.
Use the first-class `Gemini` option in Studio Controls, or configure the same
shape through env vars:

```env
LLM_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai
LLM_API_KEY=AIza_xxxxxxxxxxxxxxxxx
LLM_MODEL=gemini-3.5-flash
LLM_MAX_TOKENS=512
```

Notes:

- Get the API key from Google AI Studio.
- In env files, keep `LLM_API_BASE` without a trailing slash. Runtime UI input
  is normalized, but scripts and workers are easier to reason about when the
  env value is already normalized.
- Start with a health check and low output cap before running chapter
  generation. A full chapter can make several model calls.
- The Studio runtime provider file controls the web UI health check and routes
  that read the runtime provider. The Python worker still reads `LLM_API_BASE`,
  `LLM_API_KEY`, and `LLM_MODEL` from environment.

## Model Selection Policy

### Phase 1: Pipeline Plumbing

Use `llama-3.1-8b-instant`.

Purpose:

- Health check.
- API connectivity.
- Task dispatch.
- JSON schema parsing.
- Retry behavior.
- Short output tests.

Suggested `max_tokens`: `512-1000`.

### Phase 2: General Writing Pipeline Tests

Use `qwen/qwen3-32b`.

Purpose:

- Planning JSON.
- Short prose generation.
- Ledger extraction.
- Memory candidate extraction.
- Basic continuity audit.

Suggested `max_tokens`: `800-1500`.

### Phase 3: Context-Heavy Tests

Use `meta-llama/llama-4-scout-17b-16e-instruct`.

Purpose:

- `WritingContext` assembler tests.
- Larger context windows.
- Chapter planning with more memory.
- Continuity validation with bigger prompts.

Suggested `max_tokens`: `1200-2500`.

### Phase 4: Reasoning Spot Checks

Use `openai/gpt-oss-120b` or `llama-3.3-70b-versatile`.

Purpose:

- Hard planning cases.
- Conflict reasoning.
- Canon contradiction tests.
- `chapter_ledger` extraction quality checks.
- Prose quality comparison.

These models can hit free-tier limits faster. Do not use them for high-volume loops.

## Suggested Fallback Order

```text
1. meta-llama/llama-4-scout-17b-16e-instruct
2. qwen/qwen3-32b
3. llama-3.1-8b-instant
4. openai/gpt-oss-120b
5. llama-3.3-70b-versatile
```

## Health Check

Run from `apps/studio`:

```bash
npm run doctor:llm
```

For a no-network config check:

```bash
npm run doctor:llm -- --dry-run
```

`doctor:llm` reads `.runtime/llm-provider.json` first when present, then falls back to `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`, and `LLM_MAX_TOKENS`.

The doctor sends a tiny JSON-only request:

```json
{
  "model": "$LLM_MODEL",
  "messages": [
    {
      "role": "user",
      "content": "Return JSON only: {\"ok\": true, \"provider\": \"configured\"}"
    }
  ],
  "temperature": 0,
  "max_tokens": 64
}
```

It prints provider base, model, redacted key, status, latency, and parsed JSON. It must not run full chapter generation.

## Rate-Limit Troubleshooting

If the provider returns `429`, identify which limit is likely responsible:

- `RPM`: too many requests per minute.
- `RPD`: too many requests per day.
- `TPM`: too many input/output tokens per minute.
- `TPD`: too many input/output tokens per day.

If TPM is exceeded:

- Reduce prompt size.
- Reduce `LLM_MAX_TOKENS`.
- Use `meta-llama/llama-4-scout-17b-16e-instruct` when larger TPM is needed.

If RPD is exceeded:

- Switch to another model/provider.
- Wait for reset.
- Reduce test loop frequency.

If output JSON is invalid:

- Lower temperature.
- Use strict JSON-only prompting.
- Keep `max_tokens` low for health checks, but raise it if valid JSON is being truncated.

## Non-Goals

- Do not add paid billing integration.
- Do not store provider API keys in the database.
- Do not hardcode Groq as the only provider.
- Do not remove existing OpenAI-compatible provider support.
- Do not change writing pipeline behavior in provider setup docs.
- Do not run full chapter generation in health-check scripts.
