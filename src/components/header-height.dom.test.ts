// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeaderHeight } from "./header-height";

// happy-dom does no layout, so the header's height is set by hand and the
// ResizeObserver is a stub the test can fire.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let header: HTMLElement | null = null;
let resized: () => void = () => {};
let height = 0;

async function mount() {
  header = document.createElement("header");
  Object.defineProperty(header, "offsetHeight", { get: () => height });
  document.body.append(header);
  root = createRoot(header);
  await act(async () => root!.render(createElement(HeaderHeight)));
}

const headerHeight = () => document.documentElement.style.getPropertyValue("--site-header-height");

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  window.innerHeight = 800;
  height = 61;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  header?.remove();
  root = header = null;
  vi.unstubAllGlobals();
});

describe("HeaderHeight", () => {
  it("sets the header's height on the page root and follows it as the header wraps", async () => {
    await mount();
    expect(headerHeight()).toBe("61px");
    expect(header!.hasAttribute("data-tall")).toBe(false);

    height = 125;
    resized();
    expect(headerHeight()).toBe("125px");
  });

  it("lets the header stop sticking when it takes more than a quarter of the window", async () => {
    await mount();
    height = 393;
    resized();
    expect(header!.hasAttribute("data-tall")).toBe(true);
    expect(headerHeight()).toBe("0px");

    height = 61;
    resized();
    expect(header!.hasAttribute("data-tall")).toBe(false);
    expect(headerHeight()).toBe("61px");
  });

  it("clears what it set when it unmounts", async () => {
    await mount();
    await act(async () => root!.unmount());
    root = null;
    expect(headerHeight()).toBe("");
  });
});
