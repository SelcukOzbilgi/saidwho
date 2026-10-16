// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_COLORS } from "./theme";
import { ThemeToggle } from "./theme-toggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;
let reduced = false;

// The two theme-color tags the layout renders, one per system setting.
function addThemeColorTags() {
  for (const [media, color] of [
    ["(prefers-color-scheme: light)", THEME_COLORS.light],
    ["(prefers-color-scheme: dark)", THEME_COLORS.dark],
  ]) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.media = media;
    meta.content = color;
    document.head.append(meta);
  }
}

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(ThemeToggle)));
  return container.querySelector("button")!;
}

const colors = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content);

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  localStorage.clear();
  addThemeColorTags();
  reduced = false;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") && reduced }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = container = null;
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  delete document.documentElement.dataset.theme;
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("switches the page to dark and back, keeps the choice and says it's pressed", async () => {
    const button = await mount();
    expect(button.getAttribute("aria-label")).toBe("Dark theme");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    await act(async () => button.click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(button.getAttribute("aria-pressed")).toBe("true");

    await act(async () => button.click());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("gives the browser bar the page's theme, even when the system setting differs", async () => {
    // A dark theme saved on an earlier visit, on a system set to light.
    document.documentElement.dataset.theme = "dark";
    const button = await mount();
    expect(colors()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);

    await act(async () => button.click());
    expect(colors()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
  });

  it("follows a theme set elsewhere on the page", async () => {
    const button = await mount();
    await act(async () => {
      document.documentElement.dataset.theme = "dark";
      // The MutationObserver reports on a microtask.
      await Promise.resolve();
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("runs the switch inside a view transition where the browser has one", async () => {
    let finish = () => {};
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return {
        ready: Promise.reject(new Error("skipped")),
        finished: new Promise<void>((resolve) => (finish = resolve)),
      };
    });
    Object.assign(document, { startViewTransition });
    const button = await mount();

    await act(async () => button.click());
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme-switch")).toBe(true);

    await act(async () => finish());
    expect(document.documentElement.hasAttribute("data-theme-switch")).toBe(false);
  });

  it("switches at once for anyone who asked for less motion", async () => {
    const startViewTransition = vi.fn();
    Object.assign(document, { startViewTransition });
    reduced = true;
    const button = await mount();

    await act(async () => button.click());
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
