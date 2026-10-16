// @vitest-environment happy-dom

import { act, type ComponentProps, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPEN_RUN, RunSheet } from "./run-sheet";

// The sheet mounted in a page with a quote field in it. happy-dom does no
// layout, so the IntersectionObserver is a stub the test fires, and reduced
// motion is whatever the test sets.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let comeIntoView: () => void = () => {};
let reduced = false;

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(
        RunSheet,
        // The children come as the third argument, which the props type can't see.
        { tab: "Run your own" } as ComponentProps<typeof RunSheet>,
        createElement("textarea", { "aria-label": "The quote" }),
      ),
    ),
  );
}

const sheet = () => document.querySelector<HTMLElement>(".run-sheet")!;
// happy-dom puts every box at 0 by 0, which reads as off screen; this moves the sheet into view or out of it.
const onScreen = (yes: boolean) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: yes ? 100 : 5_000, bottom: yes ? 600 : 5_500 } as DOMRect);
const quote = () => document.querySelector("textarea")!;

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/");
  reduced = false;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe() {
        comeIntoView = () => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
      disconnect() {}
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: reduced && query.includes("reduce") }) as MediaQueryList);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RunSheet", () => {
  it("stays open and leaves the cursor alone when the page is only scrolled to it", async () => {
    await mount();
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(sheet().dataset.open).toBeUndefined();
    expect(document.activeElement).not.toBe(quote());
  });

  it("folds when asked for, unfolds once in view, then puts the cursor in the quote field", async () => {
    await mount();
    await act(async () => void window.dispatchEvent(new Event(OPEN_RUN)));
    expect(sheet().dataset.open).toBe("wait");
    expect(document.activeElement).not.toBe(quote());
    await act(async () => comeIntoView());
    expect(sheet().dataset.open).toBe("play");
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(document.activeElement).toBe(quote());
    expect(sheet().dataset.open).toBeUndefined();
  });

  it("opens anyway if the sheet never reports coming into view, with the cursor only if it is on screen", async () => {
    await mount();
    onScreen(true);
    await act(async () => void window.dispatchEvent(new Event(OPEN_RUN)));
    expect(sheet().dataset.open).toBe("wait");
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(sheet().dataset.open).toBe("play");
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(document.activeElement).toBe(quote());

    quote().blur();
    onScreen(false);
    await act(async () => void window.dispatchEvent(new Event(OPEN_RUN)));
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(sheet().dataset.open).toBe("play");
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(document.activeElement).not.toBe(quote());
  });

  it("opens for a click on any link to #run on this page, such as the header's", async () => {
    await mount();
    const link = document.createElement("a");
    link.href = "/#run";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.append(link);
    await act(async () => link.click());
    expect(sheet().dataset.open).toBe("wait");

    await act(async () => vi.advanceTimersByTime(3_000));
    await act(async () => vi.advanceTimersByTime(1_500));
    link.href = "/cases/x#run";
    await act(async () => link.click());
    expect(sheet().dataset.open).toBeUndefined();
  });

  it("doesn't fold a sheet the page opened on #run has already shown, and moves the cursor in", async () => {
    window.history.replaceState(null, "", "/#run");
    onScreen(true);
    await mount();
    expect(sheet().dataset.open).toBeUndefined();
    await act(async () => vi.advanceTimersByTime(100));
    expect(document.activeElement).toBe(quote());
  });

  it("opens for a #run link, on load and when the hash changes, but once for a click that does both", async () => {
    window.history.replaceState(null, "", "/#run");
    await mount();
    expect(sheet().dataset.open).toBe("wait");
    await act(async () => comeIntoView());
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(document.activeElement).toBe(quote());

    quote().blur();
    window.history.replaceState(null, "", "/");
    await act(async () => {
      window.dispatchEvent(new Event(OPEN_RUN));
      window.history.replaceState(null, "", "/#run");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(sheet().dataset.open).toBe("wait");
    await act(async () => comeIntoView());
    expect(sheet().dataset.open).toBe("play");
  });

  it("never folds with reduced motion, and still moves the cursor in", async () => {
    reduced = true;
    await mount();
    await act(async () => void window.dispatchEvent(new Event(OPEN_RUN)));
    expect(sheet().dataset.open).toBeUndefined();
    await act(async () => vi.advanceTimersByTime(100));
    expect(document.activeElement).toBe(quote());
  });
});
