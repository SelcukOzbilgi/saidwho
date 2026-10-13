import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { accessCodeFromHash, QuoteForm, takeCodeFromLink } from "./quote-form";

const render = (trialOpen: boolean, { savesRuns = false, needsCode = false } = {}) =>
  renderToStaticMarkup(
    createElement(QuoteForm, { trialOpen, needsCode, savesRuns, running: false, onStart: () => {}, onStop: () => {} }),
  );

describe("QuoteForm", () => {
  it("says what the disabled button is waiting for", () => {
    // With the trial off, the keys are what's missing, and the finished cases need none.
    expect(render(false)).toContain("Add both keys above to run it");
    expect(render(true)).toContain("Paste a quote to start.");
    // With a code needed, the trial starts selected and waits for the code.
    expect(render(true, { needsCode: true })).toContain("Add the access code above to run it, or use your own keys.");
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

  it("shows the access code field only when the server needs a code", () => {
    const withCode = render(true, { needsCode: true });
    expect(withCode).toContain("Access code");
    expect(withCode).toContain("Hackathon judges get the code in the testing instructions.");
    expect(withCode).toMatch(/<input[^>]*id="[^"]*-code"[^>]*type="password"/);
    expect(render(true)).not.toContain("Access code");
    // With the trial off there is nothing to unlock, so no field either.
    expect(render(false, { needsCode: true })).not.toContain("Access code");
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
