// @vitest-environment happy-dom

import { act, type ComponentProps, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeaturedPlay, type Plan } from "./featured-play";

// The section mounted in a page. happy-dom does no layout, so where the
// section sits is set by hand, and every IntersectionObserver is a stub the
// test fires with the elements it names. Timers are faked, so the gaps between
// parts can be stepped through.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Watcher = { callback: IntersectionObserverCallback; targets: Set<Element>; self: IntersectionObserver };
let watchers: Watcher[] = [];
let root: Root | null = null;
let wide = false;
let reduced = false;

const plan: Plan = {
  wide: [
    { act: "trail", gap: 0 },
    { act: "verdict", gap: 1000 },
    { act: "footer", gap: 500 },
  ],
  narrow: [
    { act: "verdict", gap: 0 },
    { act: "trail", gap: 700 },
    { act: "footer", gap: 1500 },
  ],
};

// Tells every observer watching any of these elements that they came into view.
// The parts are watched only once the section is seen, so a test sees the
// section first and its parts after.
function see(...els: Element[]) {
  act(() => {
    for (const w of [...watchers]) {
      const entries = els
        .filter((el) => w.targets.has(el))
        .map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry);
      if (entries.length) w.callback(entries, w.self);
    }
  });
}

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

async function mount(top: number) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top, bottom: top + 800 } as DOMRect);
  const parts = ["verdict", "trail", "footer"].map((a) => createElement("div", { key: a, "data-act": a }));
  await act(async () => root!.render(createElement(FeaturedPlay, { plan } as ComponentProps<typeof FeaturedPlay>, parts)));
  const el = (a: string) => container.querySelector<HTMLElement>(`[data-act="${a}"]`)!;
  return { section: container.firstElementChild!, verdict: el("verdict"), trail: el("trail"), footer: el("footer") };
}

const states = (p: Awaited<ReturnType<typeof mount>>) => [p.verdict, p.trail, p.footer].map((e) => e.dataset.reveal);

beforeEach(() => {
  vi.useFakeTimers();
  wide = false;
  reduced = false;
  watchers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly w: Watcher;
      constructor(callback: IntersectionObserverCallback) {
        this.w = { callback, targets: new Set(), self: this as never };
        watchers.push(this.w);
      }
      observe(el: Element) {
        this.w.targets.add(el);
      }
      unobserve(el: Element) {
        this.w.targets.delete(el);
      }
      disconnect() {
        this.w.targets.clear();
      }
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: query.includes("reduce") ? reduced : query.includes("min-width") && wide }) as MediaQueryList,
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FeaturedPlay", () => {
  it("on a phone, plays each part only once it is on screen, in reading order", async () => {
    const p = await mount(2000);
    expect(states(p)).toEqual(["wait", "wait", "wait"]);

    see(p.section);
    see(p.verdict);
    expect(states(p)).toEqual(["in", "wait", "wait"]);

    // A slow scroll: the trail's gap is long over before it shows.
    wait(3000);
    expect(p.trail.dataset.reveal).toBe("wait");
    see(p.trail);
    expect(p.trail.dataset.reveal).toBe("in");

    // The cost row is already in view, but waits for the trail to settle.
    see(p.footer);
    wait(1400);
    expect(p.footer.dataset.reveal).toBe("wait");
    wait(100);
    expect(states(p)).toEqual(["in", "in", "in"]);
  });

  it("keeps the order when every part is in view at once", async () => {
    const p = await mount(2000);
    see(p.section);
    see(p.verdict, p.trail, p.footer);
    expect(states(p)).toEqual(["in", "wait", "wait"]);
    wait(700);
    expect(states(p)).toEqual(["in", "in", "wait"]);
    wait(1500);
    expect(states(p)).toEqual(["in", "in", "in"]);
  });

  it("side by side, plays the trail first and the verdict after it", async () => {
    wide = true;
    const p = await mount(2000);
    see(p.section);
    see(p.verdict, p.trail);
    expect(states(p)).toEqual(["wait", "in", "wait"]);
    wait(1000);
    expect(states(p)).toEqual(["in", "in", "wait"]);
    wait(500);
    expect(p.footer.dataset.reveal).toBe("wait");
    see(p.footer);
    expect(states(p)).toEqual(["in", "in", "in"]);
  });

  it("leaves a section already on screen at load as the server drew it", async () => {
    const p = await mount(100);
    expect(states(p)).toEqual([undefined, undefined, undefined]);
  });

  it("leaves everything in place under reduced motion", async () => {
    reduced = true;
    const p = await mount(2000);
    expect(states(p)).toEqual([undefined, undefined, undefined]);
  });

  it("stops and puts every part back in place when it goes away", async () => {
    const p = await mount(2000);
    see(p.section);
    see(p.verdict);
    await act(async () => root!.unmount());
    root = null;
    expect(states(p)).toEqual([undefined, undefined, undefined]);
    wait(5000);
    expect(states(p)).toEqual([undefined, undefined, undefined]);
  });
});
