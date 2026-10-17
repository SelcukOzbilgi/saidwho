// @vitest-environment happy-dom

import { MotionGlobalConfig } from "motion/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CASES } from "../cases/cases";
import { CaseReplay } from "./case-replay";

// The replay mounted in a page, so focus moves as it does in a browser.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom's animations reject when motion cancels them; the test is about focus, not motion.
MotionGlobalConfig.skipAnimations = true;

let root: Root | null = null;

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(CaseReplay, { events: CASES[0].events })));
  const main = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Watch it run again"))!;
  await act(async () => main.click());
  return {
    main,
    slider: () => container.querySelector<HTMLElement>('[role="slider"]'),
    skip: () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Skip to the end") ?? null,
  };
}

// The bar and Skip go once nothing waits on them; let motion let go of them.
const settle = () => act(async () => vi.advanceTimersByTimeAsync(50));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("CaseReplay in a page: focus when the replay ends", () => {
  it("moves focus from the bar to the main button when End takes it to the end", async () => {
    const { main, slider } = await mount();
    slider()!.focus();
    await act(async () => {
      slider()!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    await settle();
    expect(slider()).toBeNull();
    expect(document.activeElement).toBe(main);
  });

  it("moves focus from Skip to the main button", async () => {
    const { main, skip } = await mount();
    skip()!.focus();
    await act(async () => skip()!.click());
    await settle();
    expect(skip()).toBeNull();
    expect(document.activeElement).toBe(main);
  });

  it("moves focus from the bar to the main button when the replay ends on its own", async () => {
    const { main, slider } = await mount();
    slider()!.focus();
    // Each step's timer is set once the last one has rendered, so step through them.
    for (let i = 0; i < CASES[0].events.length; i++) await act(async () => vi.advanceTimersByTimeAsync(400));
    await settle();
    expect(slider()).toBeNull();
    expect(document.activeElement).toBe(main);
  });

  it("leaves focus alone when it is elsewhere on the page", async () => {
    const { slider } = await mount();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    await act(async () => {
      slider()!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });
});
