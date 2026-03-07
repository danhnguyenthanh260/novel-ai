function extractDelta(payloadStr: string): string {
  try {
    const json = JSON.parse(payloadStr);
    return json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";
  } catch {
    return payloadStr;
  }
}

export function toMuseClientSse(upstream: Response): Response {
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let pending = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payloadStr = trimmed.slice(5).trim();
            if (!payloadStr || payloadStr === "[DONE]") continue;
            const delta = extractDelta(payloadStr);
            if (!delta) continue;
            controller.enqueue(encoder.encode(`data: ${delta}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
