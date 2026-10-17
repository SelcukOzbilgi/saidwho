// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreMeter } from "./score-meter";

// The meter mounted in a page. happy-dom does no layout, so the
// IntersectionObserver is a stub the test fires, and reduced motion is
// whatever the test sets.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let comeIntoView: () => void = () => {};
let reduced = false;

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(ScoreMeter, { got: 13, of: 20, strong: true })));
  const [said, digits] = container.querySelectorAll("span > span");
  const bar = container.querySelector<HTMLElement>("span[aria-hidden] > span")!;
  return { said, digits, bar };
}

// happy-dom puts every box at 0 by 0; this moves the meter into view or out of it.
const onScreen = (yes: boolean) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: yes ? 100 : 5_000, bottom: yes ? 160 : 5_060 } as DOMRect);

beforeEach(() => {
  vi.useFakeTimers();
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

describe("ScoreMeter", () => {
  it("counts up as its bar fills, while screen readers only ever get the final number", async () => {
    onScreen(false);
    const { said, digits, bar } = await mount();
    expect(digits.textContent).toBe("0");
    expect(bar.style.transform).toBe("scaleX(0)");
    expect(said.textContent).toBe("13");

    await act(async () => comeIntoView());
    await act(async () => vi.advanceTimersByTime(300));
    const partway = Number(digits.textContent);
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(13);
    expect(bar.style.transform).toMatch(/^scaleX\(0\.\d+\)$/);
    expect(said.textContent).toBe("13");

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(digits.textContent).toBe("13");
    expect(bar.style.transform).toBe("");
  });

  it("leaves a score already on screen as the server drew it", async () => {
    onScreen(true);
    const { digits, bar } = await mount();
    expect(digits.textContent).toBe("13");
    expect(bar.style.transform).toBe("");
    expect(bar.style.width).toBe("65%");
  });

  it("shows the final score at once under reduced motion", async () => {
    onScreen(false);
    reduced = true;
    const { digits, bar } = await mount();
    expect(digits.textContent).toBe("13");
    expect(bar.style.transform).toBe("");
  });
});
