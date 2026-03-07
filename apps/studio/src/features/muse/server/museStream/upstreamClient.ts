type MuseUpstreamPayload = {
  model: string;
  stream: boolean;
  temperature: number;
  max_tokens: number;
  messages: unknown[];
};

type UpstreamRequestArgs = {
  base: string;
  apiKey: string;
  payload: MuseUpstreamPayload;
};

function requestUpstream({ base, apiKey, payload }: UpstreamRequestArgs): Promise<Response> {
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchUpstreamWithFallback(args: UpstreamRequestArgs): Promise<Response> {
  try {
    return await requestUpstream(args);
  } catch (primaryErr) {
    if (!args.base.includes("host.docker.internal")) throw primaryErr;
    const fallbackBase = args.base.replace("host.docker.internal", "localhost");
    return requestUpstream({ ...args, base: fallbackBase });
  }
}

export function buildMuseUpstreamPayload(params: {
  body: Record<string, unknown>;
  mode: "bullets" | "block";
  messages: unknown[];
}): MuseUpstreamPayload {
  return {
    model: process.env.LLM_MODEL ?? "qwen2.5-7b",
    stream: true,
    temperature: typeof params.body.temperature === "number" ? params.body.temperature : 0.92,
    max_tokens: params.mode === "block" ? 420 : 320,
    messages: params.messages,
  };
}

export function upstreamUnavailableResponse(error: unknown): Response {
  return Response.json(
    { error: "LLM_UPSTREAM_UNREACHABLE", detail: error instanceof Error ? error.message : String(error) },
    { status: 502 }
  );
}
