import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { CASES } from "../cases/cases";
import { parseEvalCases } from "../eval/cases";
import { AccessCodeField, accessCodeFromHash, EXAMPLES, initialMode, QuoteForm, takeCodeFromLink } from "./quote-form";

const render = (trialOpen: boolean, { savesRuns = false, needsCode = false } = {}) =>
  renderToStaticMarkup(
    createElement(QuoteForm, { trialOpen, needsCode, savesRuns, running: false, onStart: () => {}, onStop: () => {} }),
  );

describe("QuoteForm", () => {
  it("says what the disabled button is waiting for", () => {
    // With the trial off, the keys are what's missing, and the finished cases need none.
    expect(render(false)).toContain("Add both keys above to run it");
    expect(render(true)).toContain("Paste a quote to start.");
    // With a code needed, the form starts on the visitor's own keys.
    expect(render(true, { needsCode: true })).toContain("Add both keys above to run it");
  });

  it("says runs are saved only when they are", () => {
    expect(render(true)).not.toContain("Every run is saved");
    expect(render(true, { savesRuns: true })).toContain("Every run is saved and gets a public link");
  });

  it("names each trial state plainly", () => {
    expect(render(true)).toContain("Free trial, on us");
    expect(render(true, { needsCode: true })).toContain("Free trial, with an access code");
    expect(render(false)).toContain("Free trial (not offered on this site)");
    expect(render(false, { needsCode: true })).toContain("Free trial (not offered on this site)");
    expect(render(false)).not.toContain("off right now");
  });

  it("starts on the trial only when anyone may use it", () => {
    expect(initialMode(true, false)).toBe("trial");
    // Someone with the code arrives through its link, which picks the trial for them.
    expect(initialMode(true, true)).toBe("byok");
    expect(initialMode(false, false)).toBe("byok");
    expect(initialMode(false, true)).toBe("byok");
    expect(render(true, { needsCode: true })).toMatch(/<input[^>]*type="radio"[^>]*checked=""[^>]*>My own Nebius and Tavily keys/);
  });

  it("shows no access code field until the trial is picked, and none at all without a code", () => {
    expect(render(true, { needsCode: true })).not.toContain("Access code");
    expect(render(true)).not.toContain("Access code");
    expect(render(false, { needsCode: true })).not.toContain("Access code");
  });

  it("asks for the code in a hidden field and says where judges find it", () => {
    const html = renderToStaticMarkup(createElement(AccessCodeField, { id: "f-code", value: "", onChange: () => {} }));
    expect(html).toContain("Access code");
    expect(html).toContain("Hackathon judges get the code in the testing instructions.");
    expect(html).toMatch(/<input[^>]*id="f-code"[^>]*type="password"/);
  });
});

describe("example quotes", () => {
  const evalCases = parseEvalCases(readFileSync(new URL("../../eval/quotes.jsonl", import.meta.url), "utf8"));

  it("open their finished case when one exists, and fill the form when none does", () => {
    for (const example of EXAMPLES) {
      const found = CASES.find((c) => c.run.quote === example.quote);
      expect(found?.caseId).toBe(example.caseId);
    }
    expect(EXAMPLES.some((e) => e.caseId)).toBe(true);
    expect(EXAMPLES.some((e) => !e.caseId)).toBe(true);
  });

  it("are test-set quotes, so a run on one can be checked against a known answer", () => {
    for (const example of EXAMPLES) {
      const known = evalCases.find((c) => c.quote === example.quote);
      expect(known?.popular_attribution).toBe(example.popularAttribution);
      expect(known?.language).toBe(example.language);
    }
  });

  it("show as buttons that fill the form, and links to the cases already run", () => {
    const html = render(false);
    for (const example of EXAMPLES) {
      if (example.caseId) expect(html).toContain(`href="/cases/${example.caseId}"`);
      else expect(html).toMatch(new RegExp(`<button[^>]*type="button"[^>]*>${example.popularAttribution}</button>`));
    }
  });
});

describe("accessCodeFromHash", () => {
  it("reads the code from a #code= link, decoded and trimmed", () => {
    expect(accessCodeFromHash("#code=judges-only-code-123")).toBe("judges-only-code-123");
    // A code from `openssl rand -base64 18` can hold + and /, which stay as they are.
    expect(accessCodeFromHash("#code=Ab+c/9xYz")).toBe("Ab+c/9xYz");
    expect(accessCodeFromHash("#code=a%2Bb%3Dc")).toBe("a+b=c");
    expect(accessCodeFromHash("#x=1&code=%20abc%20")).toBe("abc");
  });

  it("gives null when the link carries no code, and blank for an empty or broken one", () => {
    expect(accessCodeFromHash("")).toBeNull();
    expect(accessCodeFromHash("#cases")).toBeNull();
    expect(accessCodeFromHash("#nocode=abc")).toBeNull();
    expect(accessCodeFromHash("#code=")).toBe("");
    expect(accessCodeFromHash("#code=%E0%A4%A")).toBe("");
  });
});

describe("takeCodeFromLink", () => {
  // A stand-in for the page's address and history that records what was replaced.
  const page = (hash: string) => {
    const replaced: string[] = [];
    const location = { hash, pathname: "/", search: "?ref=devpost" };
    const history = { replaceState: (_state: unknown, _unused: string, url?: string | URL | null) => void replaced.push(String(url)) };
    return { location, history, replaced };
  };
  const codeTrial = { trialOpen: true, needsCode: true };

  it("reads the code and cleans it out of the address, keeping the path and query", () => {
    const { location, history, replaced } = page("#code=judges-only-code-123");
    expect(takeCodeFromLink(location, history, codeTrial)).toBe("judges-only-code-123");
    expect(replaced).toEqual(["/?ref=devpost"]);
  });

  it("leaves an address without a code alone", () => {
    for (const hash of ["", "#cases", "#nocode=abc"]) {
      const { location, history, replaced } = page(hash);
      expect(takeCodeFromLink(location, history, codeTrial)).toBeNull();
      expect(replaced).toEqual([]);
    }
  });

  it("cleans out a blank or broken code but doesn't use it", () => {
    for (const hash of ["#code=", "#code=%20", "#code=%E0%A4%A"]) {
      const { location, history, replaced } = page(hash);
      expect(takeCodeFromLink(location, history, codeTrial)).toBeNull();
      expect(replaced).toEqual(["/?ref=devpost"]);
    }
  });

  it("fills nothing when the trial is off or needs no code, but still cleans the address", () => {
    for (const state of [
      { trialOpen: false, needsCode: true },
      { trialOpen: true, needsCode: false },
      { trialOpen: false, needsCode: false },
    ]) {
      const { location, history, replaced } = page("#code=judges-only-code-123");
      expect(takeCodeFromLink(location, history, state)).toBeNull();
      expect(replaced).toEqual(["/?ref=devpost"]);
    }
  });
});
