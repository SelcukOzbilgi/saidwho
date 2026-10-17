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

describe("QuoteForm in a page: checking the visitor's keys", () => {
  const NEBIUS = "fake-visitor-nebius-key-0042";
  const TAVILY = "fake-visitor-tavily-key-4f2a";
  const keyField = (name: "nebius" | "tavily") => field<HTMLInputElement>(`input[id$="-${name}"]`);
  const statusLine = (name: "nebius" | "tavily") => document.getElementById(`${keyField(name).id}-status`)!;
  const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

  // A stand-in for POST /api/keys/check that answers with the states given, and
  // remembers which keys it was asked about.
  function stubCheck(answer: Record<string, unknown> | (() => Promise<Response>)) {
    const asked: Record<string, string>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as Record<string, string>;
        asked.push(body);
        if (typeof answer === "function") return answer();
        const reply = Object.fromEntries(
          Object.entries(answer).filter(([name]) => (name === "nebius" ? body.nebiusApiKey : body.tavilyApiKey)),
        );
        return new Response(JSON.stringify(reply), { status: 200 });
      }),
    );
    return asked;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("checks a key once it's pasted, not on each keystroke, and says it works with the key's tail and credits", async () => {
    const asked = stubCheck({ tavily: { state: "works", creditsLeft: 812 } });
    await mount();
    await act(async () => setValue(keyField("tavily"), "fake"));
    await act(async () => setValue(keyField("tavily"), "fake-visitor"));
    expect(asked).toEqual([]);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(keyField("tavily"), TAVILY);
      keyField("tavily").dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    });
    await settle();
    expect(asked).toEqual([{ tavilyApiKey: TAVILY }]);
    expect(statusLine("tavily").textContent).toBe("Works. Tavily accepted the key ending in 4f2a, 812 credits left.");
    expect(keyField("tavily").type).toBe("password");
    // Nothing on the page shows the key but its own field, as dots.
    expect(container!.textContent).not.toContain(TAVILY);
  });

  it("checks a key when its field is left, and a refused key says who refused it and blocks the run", async () => {
    stubCheck({ nebius: { state: "rejected" }, tavily: { state: "works", creditsLeft: null } });
    const onStart = vi.fn();
    const { form } = await mount({ onStart });
    await act(async () => setValue(quoteField(), "A quote I saw"));
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    await act(async () => setValue(keyField("tavily"), TAVILY));
    await act(async () => keyField("nebius").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    await settle();

    expect(statusLine("nebius").textContent).toContain("Nebius rejected this key.");
    expect(statusLine("nebius").querySelector("a")?.getAttribute("href")).toBe("https://tokenfactory.nebius.com/");
    expect(keyField("nebius").getAttribute("aria-invalid")).toBe("true");
    expect(keyField("nebius").getAttribute("aria-describedby")).toBe(statusLine("nebius").id);
    expect(container!.textContent).toContain("Nebius rejected the key above. Fix it to run.");
    expect(field<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    await act(async () => form.requestSubmit());
    await settle();
    expect(onStart).not.toHaveBeenCalled();

    // A key typed over is a new key: no longer refused, and not checked until it's left or pasted.
    await act(async () => setValue(keyField("nebius"), `${NEBIUS}-new`));
    expect(keyField("nebius").hasAttribute("aria-invalid")).toBe(false);
    expect(statusLine("nebius").textContent).toBe("Get one at tokenfactory.nebius.com.");
  });

  it("checks both keys before a run starts, in one call, then starts it", async () => {
    const asked = stubCheck({ nebius: { state: "works" }, tavily: { state: "works", creditsLeft: 3 } });
    const onStart = vi.fn();
    const { form } = await mount({ onStart });
    await act(async () => setValue(quoteField(), "A quote I saw"));
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    await act(async () => setValue(keyField("tavily"), TAVILY));
    await act(async () => form.requestSubmit());
    await settle();
    expect(asked).toEqual([{ nebiusApiKey: NEBIUS, tavilyApiKey: TAVILY }]);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].keys).toEqual({ mode: "byok", nebiusApiKey: NEBIUS, tavilyApiKey: TAVILY });
  });

  it("keeps the cursor on the button while the keys are checked, and starts one run however often it's pressed", async () => {
    let answer: (response: Response) => void = () => {};
    const asked = stubCheck(() => new Promise<Response>((resolve) => (answer = resolve)));
    const onStart = vi.fn();
    const { form } = await mount({ onStart });
    await act(async () => setValue(quoteField(), "A quote I saw"));
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    await act(async () => setValue(keyField("tavily"), TAVILY));
    const run = field<HTMLButtonElement>('button[type="submit"]');
    run.focus();
    await act(async () => form.requestSubmit());
    expect(run.textContent).toContain("Checking your keys");
    expect(run.getAttribute("aria-disabled")).toBe("true");
    expect(run.disabled).toBe(false);
    expect(document.activeElement).toBe(run);
    await act(async () => form.requestSubmit());
    expect(asked).toHaveLength(1);
    await act(async () => answer(new Response(JSON.stringify({ nebius: { state: "works" }, tavily: { state: "works" } }))));
    await settle();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("stops a run whose key is refused in the check before it, and puts the cursor in that key", async () => {
    stubCheck({ nebius: { state: "works" }, tavily: { state: "rejected" } });
    const onStart = vi.fn();
    const { form } = await mount({ onStart });
    await act(async () => setValue(quoteField(), "A quote I saw"));
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    await act(async () => setValue(keyField("tavily"), TAVILY));
    await act(async () => form.requestSubmit());
    await settle();
    expect(onStart).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(keyField("tavily"));
    expect(statusLine("tavily").textContent).toContain("Tavily rejected this key.");
  });

  it("lets the run go when the keys couldn't be checked", async () => {
    stubCheck(async () => new Response(JSON.stringify({ error: "too_many_checks" }), { status: 429 }));
    const onStart = vi.fn();
    const { form } = await mount({ onStart });
    await act(async () => setValue(quoteField(), "A quote I saw"));
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    await act(async () => setValue(keyField("tavily"), TAVILY));
    await act(async () => keyField("tavily").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    await settle();
    expect(statusLine("tavily").textContent).toBe("Couldn't check it just now. The run will still try it.");
    await act(async () => form.requestSubmit());
    await settle();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("says it's checking while the provider is asked", async () => {
    let answer: (response: Response) => void = () => {};
    stubCheck(() => new Promise<Response>((resolve) => (answer = resolve)));
    await mount();
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    await act(async () => keyField("nebius").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(statusLine("nebius").textContent).toBe("Checking with Nebius…");
    await act(async () => answer(new Response(JSON.stringify({ nebius: { state: "works" } }))));
    await settle();
    expect(statusLine("nebius").textContent).toBe("Works. Nebius accepted the key ending in 0042.");
  });

  it("shows a key only when asked, and hides it again once a run starts", async () => {
    await mount();
    const toggle = () => field<HTMLButtonElement>('button[aria-label$="Nebius API key"]');
    await act(async () => setValue(keyField("nebius"), NEBIUS));
    expect(keyField("nebius").type).toBe("password");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    await act(async () => toggle().click());
    expect(keyField("nebius").type).toBe("text");
    expect(toggle().getAttribute("aria-label")).toBe("Hide Nebius API key");

    await act(async () =>
      root!.render(createElement(QuoteForm, { trialOpen: false, needsCode: false, savesRuns: false, running: true, onStart: () => {}, onStop: () => {} })),
    );
    expect(keyField("nebius").type).toBe("password");
  });

  it("hides a shown access code again once a run starts, as it does a key", async () => {
    await mount({ trialOpen: true, needsCode: true });
    await act(async () => field<HTMLInputElement>('input[type="radio"]').click());
    const code = () => field<HTMLInputElement>('input[id$="-code"]');
    await act(async () => field<HTMLButtonElement>('button[aria-label="Show Access code"]').click());
    expect(code().type).toBe("text");

    await act(async () =>
      root!.render(createElement(QuoteForm, { trialOpen: true, needsCode: true, savesRuns: false, running: true, onStart: () => {}, onStop: () => {} })),
    );
    expect(code().type).toBe("password");
  });
});
