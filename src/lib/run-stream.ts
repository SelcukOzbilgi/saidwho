import { type RunEvent, runEventSchema } from "../agent/events";
import { isRunId } from "./run-id";

// Reads the server-sent events of POST /api/investigate in the browser. The
// route takes a POST body (keys never go in a URL), so EventSource is out and
// the frames are parsed here by hand.

// saved carries the id of the run's public page, once the server has saved it.
export type StreamItem = { kind: "event"; event: RunEvent } | { kind: "run_failed" } | { kind: "saved"; id: string };

// One SSE frame: its event name (if any) and its data lines joined by "\n".
type Frame = { event: string | null; data: string };

function parseFrame(block: string): Frame | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    // A line starting with ":" is a comment, such as the keep-alive heartbeat.
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

// Frames can be split across chunks or arrive several to a chunk; they end at a
// blank line. A frame that isn't a known run event is skipped rather than
// ending the run, so an older page keeps working if the server adds an event.
export async function* readRunStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamItem> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // The route ends lines with "\n" only (see lib/server/sse.ts).
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = parseFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (!frame) continue;
        if (frame.event === "error") {
          yield { kind: "run_failed" };
          continue;
        }
        let json: unknown;
        try {
          json = JSON.parse(frame.data);
        } catch {
          continue;
        }
        if (frame.event === "saved") {
          const id = (json as { id?: unknown } | null)?.id;
          if (typeof id === "string" && isRunId(id)) yield { kind: "saved", id };
          continue;
        }
        const parsed = runEventSchema.safeParse(json);
        if (parsed.success) yield { kind: "event", event: parsed.data };
      }
    }
  } finally {
    // Closes the connection when the caller stops reading early.
    await reader.cancel().catch(() => {});
  }
}
