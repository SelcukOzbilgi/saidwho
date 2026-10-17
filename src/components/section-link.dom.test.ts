// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeLink } from "./home-link";
import { SectionLink } from "./section-link";

// Outside a Next app there's no router, so the page's path is set by hand and
// Link is a plain anchor, as it renders in the browser.
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

async function mount(element: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container.querySelector("a")!;
}

// A click as the browser sends it; the anchor itself goes nowhere in happy-dom.
function click(link: HTMLAnchorElement, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  link.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  pathname = "/";
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = container = null;
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("SectionLink", () => {
  it("links to the section on the home page and tells the nav which one was picked", async () => {
    const follow = vi.fn();
    const link = await mount(createElement(SectionLink, { id: "cases", onFollow: follow }, "Cases"));
    expect(link.getAttribute("href")).toBe("/#cases");
    const event = click(link);
    expect(follow).toHaveBeenCalledWith("cases");
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a click that opens a new tab alone", async () => {
    const follow = vi.fn();
    const link = await mount(createElement(SectionLink, { id: "cases", onFollow: follow }, "Cases"));
    click(link, { metaKey: true });
    click(link, { ctrlKey: true });
    expect(follow).not.toHaveBeenCalled();
  });

  it("tells the nav nothing from another page, where the link goes home first", async () => {
    pathname = "/cases/insanity-same-thing";
    const follow = vi.fn();
    const link = await mount(createElement(SectionLink, { id: "cases", onFollow: follow }, "Cases"));
    click(link);
    expect(follow).not.toHaveBeenCalled();
  });
});

describe("HomeLink", () => {
  it("glides to the top of the home page and drops the #section from the address", async () => {
    window.history.replaceState(null, "", "/#cases");
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const link = await mount(createElement(HomeLink, null, "Said Who?"));
    const event = click(link);
    expect(event.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(window.location.hash).toBe("");
  });

  it("jumps instead of gliding for anyone who asked for less motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const link = await mount(createElement(HomeLink, null, "Said Who?"));
    click(link);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("is a plain link home on any other page", async () => {
    pathname = "/cases/insanity-same-thing";
    const link = await mount(createElement(HomeLink, null, "Said Who?"));
    expect(link.getAttribute("href")).toBe("/");
    expect(click(link).defaultPrevented).toBe(false);
  });
});
