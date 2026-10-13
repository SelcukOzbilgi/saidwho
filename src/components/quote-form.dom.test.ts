// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLES, QuoteForm } from "./quote-form";

// The form mounted in a page, so clicks and links go through React as they do
// in a browser. The rest of the suite renders markup on the node environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Options = { trialOpen?: boolean; needsCode?: boolean; running?: boolean };

let root: Root | null = null;
let container: HTMLElement | null = null;

async function mount({ trialOpen = false, needsCode = false, running = false }: Options = {}) {
  // Inside the "Run your own" section, as on the home page.
  const section = document.createElement("section");
  section.id = "run";
  container = document.createElement("div");
  section.append(container);
  document.body.append(section);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(QuoteForm, { trialOpen, needsCode, savesRuns: false, running, onStart: () => {}, onStop: () => {} }));
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
