type UpstreamPayload = {
  model: string;
  stream: boolean;
  messages: unknown[];
} & Record<string, unknown>;

type UpstreamRequestArgs = {
  base: string;
  apiKey: string;
  payload: UpstreamPayload;
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
    if (!args.base.includes("host.docker.internal")) {
      throw primaryErr;
    }
    const fallbackBase = args.base.replace("host.docker.internal", "localhost");
    return requestUpstream({ ...args, base: fallbackBase });
  }
}

export function buildUpstreamPayload(body: Record<string, unknown>, messages: unknown[]): UpstreamPayload {
  return {
    model: process.env.LLM_MODEL ?? "qwen2.5-7b",
    stream: true,
    ...body,
    messages,
  };
}

export function toSseResponse(upstream: Response): Response {
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
