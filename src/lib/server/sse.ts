// Server-sent event framing. Each run event is one `data:` line of JSON, so a
// client reads them with any SSE parser and validates them with runEventSchema.

export const toSseChunk = (event: unknown): string => `data: ${JSON.stringify(event)}\n\n`;

// Sent when the run stops on an unexpected error. It carries a fixed code only;
// the error itself is logged on the server, with keys removed.
export const SSE_RUN_FAILED = `event: error\ndata: ${JSON.stringify({ error: "run_failed" })}\n\n`;

// A comment line. Keeps proxies from closing a quiet connection while a slow
// model call runs; SSE parsers ignore it.
export const SSE_HEARTBEAT = ": keep-alive\n\n";

export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  // Stops Nginx-style proxies from buffering the stream (see Next's streaming guide).
  "X-Accel-Buffering": "no",
};
