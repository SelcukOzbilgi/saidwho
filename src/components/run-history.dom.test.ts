// @vitest-environment happy-dom

import { MotionGlobalConfig } from "motion/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { type PastRun, rememberRun } from "../lib/run-history";
import { verdictWords } from "../lib/run-state";
import { RunHistory } from "./run-history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom's animations reject when motion cancels them; the test is about what shows, not motion.
MotionGlobalConfig.skipAnimations = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const run = (id: string, extra: Partial<PastRun> = {}): PastRun => ({
  id,
  quote: "A smooth sea never made a skilled sailor.",
  language: "en",
  credit: "Franklin D. Roosevelt",
  verdict: "misattributed",
  trace: "1868, an English proverb collection",
  at: "2026-10-18T10:00:00.000Z",
  ...extra,
});

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(RunHistory)));
}

const links = () => [...container!.querySelectorAll("a")].map((a) => a.getAttribute("href"));
const button = (text: string) => [...container!.querySelectorAll("button")].find((b) => b.textContent === text);

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

describe("RunHistory", () => {
  it("shows nothing until this browser has a run", async () => {
    await mount();
    expect(container!.innerHTML).toBe("");
  });

  it("lists the runs kept here, newest first, each linking to its page", async () => {
    rememberRun(run("first-run-1"));
    rememberRun(run("second-run1", { verdict: null, credit: null, trace: null, language: "tr", quote: "Gel, gel" }));
    await mount();
    expect(container!.querySelector("h2")!.textContent).toBe("Your runs");
    expect(links()).toEqual(["/runs/second-run1", "/runs/first-run-1"]);
    const [second, first] = [...container!.querySelectorAll("li")];
    expect(second.textContent).toContain("No verdict");
    expect(second.textContent).toContain("Credited to no one in particular");
    expect(second.querySelector("[lang]")!.getAttribute("lang")).toBe("tr");
    expect(first.textContent).toContain(verdictWords("misattributed"));
    expect(first.textContent).toContain("Earliest trace: 1868");
    expect(first.querySelector("time")!.getAttribute("datetime")).toBe("2026-10-18T10:00:00.000Z");
  });

  it("adds a run saved while the page is open at the front", async () => {
    rememberRun(run("first-run-1"));
    await mount();
    await act(async () => rememberRun(run("later-run-1")));
    expect(links()).toEqual(["/runs/later-run-1", "/runs/first-run-1"]);
  });

  it("asks before clearing the list, and keeps it when told to", async () => {
    rememberRun(run("first-run-1"));
    await mount();
    await act(async () => button("Clear this list")!.click());
    expect(container!.textContent).toContain("Take 1 run off this list? Their pages stay up.");
    expect(document.activeElement).toBe(button("Keep"));
    await act(async () => button("Keep")!.click());
    expect(links()).toEqual(["/runs/first-run-1"]);
    expect(document.activeElement).toBe(button("Clear this list"));

    await act(async () => button("Clear this list")!.click());
    await act(async () => button("Clear")!.click());
    expect(container!.querySelector("section")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
