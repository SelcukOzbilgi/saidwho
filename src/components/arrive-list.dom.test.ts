// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArriveList } from "./arrive-list";

// The list mounted in a page. happy-dom does no layout, so each item's place
// is set by hand, and the IntersectionObserver is a stub the test fires with
// the items it names.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let seen: (items: Element[]) => void = () => {};
let reduced = false;

async function mount(tops: number[]) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = tops[Number(this.dataset.n)] ?? 0;
    return { top, bottom: top + 200 } as DOMRect;
  });
  const items = tops.map((_, n) => createElement("li", { key: n, "data-n": n }, `Card ${n}`));
  await act(async () => root!.render(createElement(ArriveList, null, items)));
  return [...container.querySelectorAll("li")];
}

beforeEach(() => {
  reduced = false;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {
        seen = (items) =>
          this.callback(
            items.map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry),
            this as never,
          );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: reduced && query.includes("reduce") }) as MediaQueryList);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ArriveList", () => {
  it("leaves cards on screen alone and sets the rest back until they are seen", async () => {
    const cards = await mount([100, 400, 2_000, 2_000, 3_000]);
    expect(cards.map((c) => c.dataset.arrive)).toEqual([undefined, undefined, "wait", "wait", "wait"]);
  });

  it("brings in cards seen together a beat apart, in reading order", async () => {
    const cards = await mount([2_000, 2_000, 3_000]);
    await act(async () => seen([cards[0], cards[1]]));
    expect(cards.map((c) => c.dataset.arrive)).toEqual(["in", "in", "wait"]);
    expect(cards[0].style.getPropertyValue("--wait")).toBe("0ms");
    expect(cards[1].style.getPropertyValue("--wait")).toBe("70ms");
  });

  it("sets nothing back under reduced motion", async () => {
    reduced = true;
    const cards = await mount([2_000, 3_000]);
    expect(cards.map((c) => c.dataset.arrive)).toEqual([undefined, undefined]);
  });
});
