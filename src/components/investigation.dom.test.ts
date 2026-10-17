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

// A stream that sends the started event (or nothing) and then stays open until the run is stopped.
function openStream(signal: AbortSignal, first: RunEvent | null = STARTED) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(first)}\n\n`));
      signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function mount(trialOpen = true) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(Investigation, { trialOpen, needsCode: false, savesRuns: false, heading: createElement("h1", null, "Run your own") }),
    );
  });
}

// A whole run's stream, sent at once and closed.
function wholeStream(events: RunEvent[]) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
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
    // The bar sits in one box with the run, so it can stay stuck while the run scrolls by.
    const bar = container!.querySelector('[role="region"][aria-label="This run"]')!;
    expect(bar.parentElement!.querySelector("blockquote")?.textContent).toContain("Q");
    expect(document.activeElement).toBe(bar);
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

  it("keeps the form when the server turns the run down before it starts, and shows why", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ error: "daily_budget_spent" }), { status: 429, headers: { "content-type": "application/json" } })),
    );
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await mount();
    await typeAndRun("A quote I saw");

    expect(formBox().hidden).toBe(false);
    const alert = container!.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Today's free trial budget is spent");
    expect(alert?.textContent).toContain("Use my own keys");
    expect(scrolled.mock.contexts).toContain(alert);
    expect(button("Run another quote")).toBeUndefined();
  });

  it("says so when a run is stopped before anything came back", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => Promise.resolve(openStream(init.signal!, null)));
    await mount();
    await typeAndRun("A quote I saw");

    expect(formBox().hidden).toBe(false);
    await act(async () => button("Stop")!.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(container!.textContent).toContain("You stopped the run before it began.");
    expect(button("Find the source")).toBeDefined();
  });

  it("says plainly when a run ends on a refused key, and takes the visitor to that key", async () => {
    const NEBIUS = "fake-visitor-nebius-key-0042";
    const TAVILY = "fake-visitor-tavily-key-4f2a";
    vi.stubGlobal("fetch", (url: string) =>
      Promise.resolve(
        url === "/api/keys/check"
          ? new Response(JSON.stringify({ nebius: { state: "unknown" }, tavily: { state: "works", creditsLeft: null } }))
          : wholeStream([
              STARTED,
              { type: "plan_failed", tier: "super", costUsd: 0, usageKnown: false, latencyMs: 9, reason: "auth: The Nebius API key was rejected." },
              { type: "done", nebiusUsd: 0, tavilyCredits: 0, unknownCostCalls: 1, seconds: 1 },
            ]),
      ),
    );
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await mount(false);
    const key = (name: string) => container!.querySelector<HTMLInputElement>(`input[id$="-${name}"]`)!;
    await act(async () => {
      for (const [name, value] of [["nebius", NEBIUS], ["tavily", TAVILY]]) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(key(name), value);
        key(name).dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await typeAndRun("A quote I saw");

    const alert = container!.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Nebius rejected your key");
    expect(alert.textContent).toContain("before it spent anything");
    const bar = container!.querySelector('[role="region"][aria-label="This run"]')!;
    expect(bar.textContent).toContain("Ended early · Nebius key rejected");
    // Neither the bar nor the run shows a key.
    for (const text of [NEBIUS, TAVILY, NEBIUS.slice(-4)]) expect(bar.parentElement!.textContent).not.toContain(text);

    await act(async () => button("Fix the Nebius key")!.click());
    expect(formBox().hidden).toBe(false);
    expect(document.activeElement).toBe(key("nebius"));
    expect(key("nebius").value).toBe(NEBIUS);
    expect(key("nebius").getAttribute("aria-invalid")).toBe("true");
  });

  it("opens the form on a key that \"Try again\" finds refused, instead of doing nothing", async () => {
    let nebiusChecks = 0;
    let runs = 0;
    let answerCheck: (() => void) | null = null;
    const searchFailed = (query: string): RunEvent => ({ type: "search_failed", query, reason: "upstream" });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url === "/api/keys/check") {
        const body = JSON.parse(String(init.body)) as Record<string, string>;
        if (!body.nebiusApiKey) return new Response(JSON.stringify({ tavily: { state: "works", creditsLeft: 500 } }));
        nebiusChecks++;
        // The check "Try again" makes waits, so the test can see the button while it does.
        if (nebiusChecks > 1) await new Promise<void>((resolve) => (answerCheck = resolve));
        return new Response(JSON.stringify({ nebius: { state: nebiusChecks > 1 ? "rejected" : "unknown" } }));
      }
      runs++;
      return wholeStream([
        STARTED,
        { type: "planned", tier: "super", costUsd: 0, usageKnown: true, latencyMs: 9, variants: [], candidateAuthors: [], queries: ['"Q"', "Q origin"] },
        searchFailed('"Q"'),
        searchFailed("Q origin"),
        { type: "judge_skipped", reason: "no verified evidence" },
        { type: "done", nebiusUsd: 0, tavilyCredits: 0, unknownCostCalls: 0, seconds: 1 },
      ]);
    });
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await mount(false);
    const key = (name: string) => container!.querySelector<HTMLInputElement>(`input[id$="-${name}"]`)!;
    await act(async () => {
      for (const [name, value] of [["nebius", "fake-visitor-nebius-key-0042"], ["tavily", "fake-visitor-tavily-key-4f2a"]]) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(key(name), value);
        key(name).dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await typeAndRun("A quote I saw");
    expect(container!.querySelector('[role="alert"]')!.textContent).toContain("Tavily didn't answer");
    expect(formBox().hidden).toBe(true);

    await act(async () => button("Try again")!.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    const busy = [...container!.querySelectorAll('[role="alert"] button')].find((b) => b.textContent?.includes("Checking your keys")) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");

    await act(async () => answerCheck!());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(runs).toBe(1);
    expect(nebiusChecks).toBe(2);
    expect(formBox().hidden).toBe(false);
    expect(document.activeElement).toBe(key("nebius"));
    expect(key("nebius").getAttribute("aria-invalid")).toBe("true");
    expect(container!.textContent).toContain("Nebius rejected this key");
  });
});
