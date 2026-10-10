import { describe, expect, it } from "vitest";

import type { RunEvent } from "../agent/events";
import { SSE_HEARTBEAT, SSE_RUN_FAILED, toRunIdChunk, toSavedChunk, toSseChunk } from "./server/sse";
import { readRunStream, type StreamItem } from "./run-stream";

const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};

async function collect(chunks: string[]): Promise<StreamItem[]> {
  const items: StreamItem[] = [];
  for await (const item of readRunStream(streamOf(chunks))) items.push(item);
  return items;
}

const DONE: RunEvent = { type: "done", nebiusUsd: 0.01, tavilyCredits: 5, unknownCostCalls: 0, seconds: 30 };
const ABORTED: RunEvent = { type: "aborted" };

describe("readRunStream", () => {
  it("reads the frames the route writes, skipping heartbeats", async () => {
    const items = await collect([toSseChunk(ABORTED), SSE_HEARTBEAT, toSseChunk(DONE)]);
    expect(items).toEqual([
      { kind: "event", event: ABORTED },
      { kind: "event", event: DONE },
    ]);
  });

  it("puts back together a frame split across chunks, and splits chunks holding several frames", async () => {
    const text = toSseChunk(ABORTED) + toSseChunk(DONE);
    const chunks = [text.slice(0, 7), text.slice(7, 30), text.slice(30)];
    expect(await collect(chunks)).toHaveLength(2);
    expect(await collect([text])).toHaveLength(2);
  });

  it("reports a run that failed on the server", async () => {
    expect(await collect([toSseChunk(ABORTED), SSE_RUN_FAILED])).toEqual([
      { kind: "event", event: ABORTED },
      { kind: "run_failed" },
    ]);
  });

  it("passes on the saved run's id, and only a well-formed one", async () => {
    const items = await collect([
      toRunIdChunk("abcDEF123_-"),
      toSseChunk(DONE),
      toSavedChunk("abcDEF123_-"),
      'event: saved\ndata: {"id":"eq.x&or=(a)"}\n\n',
      "event: saved\ndata: {}\n\n",
    ]);
    expect(items).toEqual([
      { kind: "run", id: "abcDEF123_-" },
      { kind: "event", event: DONE },
      { kind: "saved", id: "abcDEF123_-" },
    ]);
  });

  it("skips frames that are not run events instead of stopping", async () => {
    const items = await collect(["data: not json\n\n", 'data: {"type":"new_kind"}\n\n', toSseChunk(DONE)]);
    expect(items).toEqual([{ kind: "event", event: DONE }]);
  });
});
