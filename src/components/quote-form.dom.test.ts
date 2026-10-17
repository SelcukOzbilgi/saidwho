// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLES, QuoteForm, type QuoteRequest } from "./quote-form";

// The form mounted in a page, so clicks and links go through React as they do
// in a browser. The rest of the suite renders markup on the node environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Options = { trialOpen?: boolean; needsCode?: boolean; running?: boolean; onStart?: (request: QuoteRequest) => void };

let root: Root | null = null;
let container: HTMLElement | null = null;

async function mount({ trialOpen = false, needsCode = false, running = false, onStart = () => {} }: Options = {}) {
  // Inside the run page's section.
  const section = document.createElement("section");
  container = document.createElement("div");
  section.append(container);
  document.body.append(section);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(QuoteForm, { trialOpen, needsCode, savesRuns: false, running, onStart, onStop: () => {} }));
  });
  return { section, form: container.querySelector("form")! };
}

const field = <T extends Element>(selector: string) => container!.querySelector<T>(selector)!;
const quoteField = () => field<HTMLTextAreaElement>("textarea");
const nameField = () => field<HTMLInputElement>('input[id$="-name"]');
const languageField = () => field<HTMLSelectElement>("select");
const fillChip = (name: string) =>
  [...container!.querySelectorAll<HTMLButtonElement>('button[type="button"]')].find((b) => b.textContent === name)!;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("QuoteForm in a page: example chips", () => {
  it("fills the quote, the name and the language from each chip without a finished case", async () => {
    await mount();
    for (const example of EXAMPLES.filter((e) => !e.caseId)) {
      // Start from another language, so a chip that leaves it alone is caught.
      await act(async () => {
        languageField().value = "tr";
        languageField().dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(languageField().value).toBe("tr");
      await act(async () => fillChip(example.popularAttribution).click());
      expect(quoteField().value).toBe(example.quote);
      expect(nameField().value).toBe(example.popularAttribution);
      expect(languageField().value).toBe(example.language);
    }
  });

  it("turns off the fill chips while a run is going", async () => {
    await mount({ running: true });
    for (const example of EXAMPLES.filter((e) => !e.caseId)) {
      expect(fillChip(example.popularAttribution).disabled).toBe(true);
    }
  });
});

describe("QuoteForm in a page: the language", () => {
  // React reads a field's new value through the setter it watches, so this types the way a visitor does.
  const type = (el: HTMLTextAreaElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("starts on Not sure and then sends no language; a chip's language is sent as it is", async () => {
    const sent: QuoteRequest[] = [];
    const { form } = await mount({ trialOpen: true, onStart: (request) => sent.push(request) });
    expect(languageField().value).toBe("");
    expect(languageField().selectedOptions[0].textContent).toBe("Not sure");
    await act(async () => type(quoteField(), "A quote I saw"));
    await act(async () => form.requestSubmit());
    expect(sent.at(-1)).toMatchObject({ quote: "A quote I saw", language: null });

    const example = EXAMPLES.find((e) => !e.caseId)!;
    await act(async () => fillChip(example.popularAttribution).click());
    await act(async () => form.requestSubmit());
    expect(sent.at(-1)).toMatchObject({ quote: example.quote, language: example.language });
  });
});

describe("QuoteForm in a page: arriving through an access code link", () => {
  const CODE = "judges-only-code-123";
  const codeField = () => container!.querySelector<HTMLInputElement>('input[id$="-code"]');
  const radio = (label: string) =>
    [...container!.querySelectorAll("label")].find((l) => l.textContent?.includes(label))!.querySelector("input")!;

  const expectReadyToRun = () => {
    expect(radio("Free trial, with an access code").checked).toBe(true);
    expect(codeField()?.value).toBe(CODE);
    expect(document.activeElement).toBe(quoteField());
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/run?ref=devpost");
  };

  it("picks the trial, fills the code, puts the cursor in the quote and cleans the address on load", async () => {
    window.history.replaceState(null, "", `/run?ref=devpost#code=${CODE}`);
    await mount({ trialOpen: true, needsCode: true });
    expectReadyToRun();
  });

  it("does the same when the link is opened in a tab already on the page", async () => {
    window.history.replaceState(null, "", "/run?ref=devpost");
    await mount({ trialOpen: true, needsCode: true });
    expect(radio("My own Nebius and Tavily keys").checked).toBe(true);
    await act(async () => {
      window.history.replaceState(null, "", `/run?ref=devpost#code=${CODE}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expectReadyToRun();
  });

  it("still cleans the address, but fills nothing, when the trial is off or needs no code", async () => {
    for (const [state, keysRadio] of [
      [{ trialOpen: false, needsCode: true }, "My own Nebius and Tavily keys"],
      [{ trialOpen: true, needsCode: false }, "Free trial, on us"],
    ] as const) {
      window.history.replaceState(null, "", `/run?ref=devpost#code=${CODE}`);
      await mount(state);
      expect(codeField()).toBeNull();
      expect(radio(keysRadio).checked).toBe(true);
      expect(document.activeElement).toBe(quoteField());
      expect(window.location.hash).toBe("");
      await act(async () => root?.unmount());
      root = null;
      document.body.replaceChildren();
      vi.restoreAllMocks();
    }
  });

  it("leaves the cursor and the address alone without a code in the link", async () => {
    window.history.replaceState(null, "", "/run#top");
    await mount({ trialOpen: true, needsCode: true });
    expect(document.activeElement).not.toBe(quoteField());
    expect(window.location.hash).toBe("#top");
  });
});

describe("QuoteForm in a page: who pays", () => {
  // What a screen reader takes from an element's aria-labelledby or aria-describedby.
  const textOf = (ids: string | null) =>
    (ids ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .join(" ");

  it("names each choice by its title and describes it with its tag and line", async () => {
    await mount({ trialOpen: false });
    const [trial, keys] = [...container!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(textOf(trial.getAttribute("aria-labelledby"))).toBe("Free trial");
    expect(textOf(trial.getAttribute("aria-describedby"))).toMatch(/^Not offered on this site Trial runs are paid/);
    expect(textOf(keys.getAttribute("aria-labelledby"))).toBe("My own Nebius and Tavily keys");
    expect(textOf(keys.getAttribute("aria-describedby"))).toMatch(/^Works on any copy of the site/);
  });
});
