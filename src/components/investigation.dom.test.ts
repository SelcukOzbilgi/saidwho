// @vitest-environment happy-dom

import { MotionGlobalConfig } from "motion/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunEvent } from "../agent/events";
import { Investigation } from "./investigation";

// The run page with a stand-in for POST /api/investigate, so a run can start,
// stream and end without the server.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom's animations reject when motion cancels them; the test is about what shows, not motion.
MotionGlobalConfig.skipAnimations = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const STARTED: RunEvent = { type: "started", quote: "Q", popularAttribution: null, language: null, excludeDomains: [] };

// A stream that sends the started event and then stays open until the run is stopped.
function openStream(signal: AbortSignal) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(STARTED)}\n\n`));
      signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(Investigation, { trialOpen: true, needsCode: false, savesRuns: false, heading: createElement("h1", null, "Run your own") }),
    );
  });
}

const quoteField = () => container!.querySelector("textarea")!;
const formBox = () => container!.querySelector("form")!.parentElement!;
const button = (text: string) => [...container!.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

async function typeAndRun(text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(quoteField(), text);
    quoteField().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container!.querySelector("form")!.requestSubmit());
  // Lets the stream's first frame through.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Investigation", () => {
  it("puts the run in the form's place, and brings the form back with the quote after a stop", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => Promise.resolve(openStream(init.signal!)));
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await mount();
    await typeAndRun("A quote I saw");

    expect(formBox().hidden).toBe(true);
    expect(container!.textContent).toContain("Running");
    await act(async () => button("Stop")!.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(container!.textContent).toContain("Stopped");
    expect(container!.textContent).toContain("You stopped the run.");

    await act(async () => button("Run another quote")!.click());
    expect(formBox().hidden).toBe(false);
    expect(quoteField().value).toBe("A quote I saw");
    expect(document.activeElement).toBe(quoteField());
    expect(button("Run another quote")).toBeUndefined();
  });

  it("keeps the form when the server turns the run down before it starts", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ error: "daily_budget_spent" }), { status: 429, headers: { "content-type": "application/json" } })),
    );
    await mount();
    await typeAndRun("A quote I saw");

    expect(formBox().hidden).toBe(false);
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain("Today's free trial budget is spent.");
    expect(button("Run another quote")).toBeUndefined();
  });
});
