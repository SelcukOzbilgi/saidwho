"use client";

import { useEffect, useId, useState } from "react";

export type QuoteRequest = {
  quote: string;
  popularAttribution: string;
  language: string;
  keys: { mode: "trial"; accessCode?: string } | { mode: "byok"; nebiusApiKey: string; tavilyApiKey: string };
};

// The access code from a link like /#code=..., which fills the field in one
// click. The part after # never reaches the server or its logs. Null when the
// link carries no code.
export function accessCodeFromHash(hash: string): string | null {
  const match = /^#(?:.*&)?code=([^&]*)/.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return "";
  }
}

// What a code link leaves for the form: the code to fill in, or null. Any link
// with a code in it is cleaned out of the address bar, so the code isn't left
// in a screenshot, a shared link or the page's history entry. The code is used
// only when the trial is open and needs one. Takes the page's location and
// history, so tests can pass stand-ins.
export function takeCodeFromLink(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">,
  { trialOpen, needsCode }: { trialOpen: boolean; needsCode: boolean },
): string | null {
  const fromLink = accessCodeFromHash(location.hash);
  if (fromLink === null) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return fromLink && trialOpen && needsCode ? fromLink : null;
}

const EXAMPLES = [
  {
    quote: "Insanity is doing the same thing over and over again and expecting different results.",
    popularAttribution: "Albert Einstein",
    language: "en",
  },
  { quote: "Gel, gel, ne olursan ol yine gel", popularAttribution: "Mevlana (Rumi)", language: "tr" },
  {
    quote: "Never in the field of human conflict was so much owed by so many to so few.",
    popularAttribution: "Winston Churchill",
    language: "en",
  },
];

const LANGUAGES = [
  ["en", "English"],
  ["tr", "Turkish"],
  ["de", "German"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["ru", "Russian"],
  ["ar", "Arabic"],
  ["fa", "Persian"],
] as const;

// A visible ring for keyboard focus, on top of the darker border any focus gets.
const FIELD =
  "w-full rounded-lg border border-line bg-card outline-none focus:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent-ink";

type Props = {
  trialOpen: boolean;
  // Whether a trial run needs an access code. The code itself stays on the server.
  needsCode: boolean;
  // Whether the server saves runs, so the form says so before one starts.
  savesRuns: boolean;
  running: boolean;
  onStart: (request: QuoteRequest) => void;
  onStop: () => void;
};

// Keys and the access code stay in this component's state: never in the URL,
// storage or a log.
export function QuoteForm({ trialOpen, needsCode, savesRuns, running, onStart, onStop }: Props) {
  const id = useId();
  const [quote, setQuote] = useState("");
  const [popularAttribution, setPopularAttribution] = useState("");
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState<"trial" | "byok">(trialOpen ? "trial" : "byok");
  const [nebiusApiKey, setNebiusApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [accessCode, setAccessCode] = useState("");

  // A link with the code in it fills the field and picks the trial, on load or
  // when the link is opened in a tab already on this page, which changes only
  // the hash.
  useEffect(() => {
    const readLink = () => {
      const code = takeCodeFromLink(window.location, window.history, { trialOpen, needsCode });
      if (code === null) return;
      setAccessCode(code);
      setMode("trial");
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, [trialOpen, needsCode]);

  const codeIn = !needsCode || accessCode.trim() !== "";
  // The name is optional: left blank, the planner says who it's usually credited to.
  const keysIn = mode === "trial" ? codeIn : nebiusApiKey.trim() !== "" && tavilyApiKey.trim() !== "";
  const ready = quote.trim() !== "" && keysIn;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (running || !ready) return;
    onStart({
      quote,
      popularAttribution,
      language,
      keys: mode === "trial" ? (needsCode ? { mode, accessCode } : { mode }) : { mode, nebiusApiKey, tavilyApiKey },
    });
  };

  const field = `${FIELD} px-3 py-2 disabled:opacity-60`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Look up a quote">
      <div>
        <label htmlFor={`${id}-quote`} className="mb-1 block text-sm font-medium">
          The quote
        </label>
        <textarea
          id={`${id}-quote`}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          maxLength={500}
          rows={3}
          required
          disabled={running}
          placeholder="Paste it the way you saw it"
          className={`${field} resize-y font-serif text-lg leading-snug`}
        />
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          Try one:
          {EXAMPLES.map((example) => (
            <button
              key={example.quote}
              type="button"
              disabled={running}
              onClick={() => {
                setQuote(example.quote);
                setPopularAttribution(example.popularAttribution);
                setLanguage(example.language);
              }}
              className="py-2 underline decoration-line underline-offset-2 hover:text-foreground disabled:no-underline"
            >
              {example.popularAttribution}
            </button>
          ))}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-medium">
            Who it&apos;s usually credited to <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`${id}-name`}
            value={popularAttribution}
            onChange={(e) => setPopularAttribution(e.target.value)}
            maxLength={200}
            disabled={running}
            placeholder="Not sure? Leave it blank"
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-lang`} className="mb-1 block text-sm font-medium">
            Language of the quote
          </label>
          <select
            id={`${id}-lang`}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={running}
            className={field}
          >
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset disabled={running} className="rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-medium">Who pays for the run</legend>
        <div className="flex flex-wrap gap-x-5 text-sm">
          <label className={`flex items-center gap-2 py-1.5 ${trialOpen ? "" : "text-muted"}`}>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === "trial"}
              onChange={() => setMode("trial")}
              disabled={!trialOpen}
              className="size-4 accent-accent"
            />
            {!trialOpen
              ? "Free trial (not offered on this site)"
              : needsCode
                ? "Free trial, with an access code"
                : "Free trial, on us"}
          </label>
          <label className="flex items-center gap-2 py-1.5">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === "byok"}
              onChange={() => setMode("byok")}
              className="size-4 accent-accent"
            />
            My own Nebius and Tavily keys
          </label>
        </div>
        {mode === "trial" && needsCode && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <KeyInput id={`${id}-code`} label="Access code" value={accessCode} onChange={setAccessCode} maxLength={200} />
            <p className="text-xs text-muted sm:col-span-2">
              Hackathon judges get the code in the testing instructions. No code? Use your own keys, or open a finished
              case below.
            </p>
          </div>
        )}
        {mode === "byok" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <KeyInput id={`${id}-nebius`} label="Nebius API key" value={nebiusApiKey} onChange={setNebiusApiKey} />
            <KeyInput id={`${id}-tavily`} label="Tavily API key" value={tavilyApiKey} onChange={setTavilyApiKey} />
            <p className="text-xs text-muted sm:col-span-2">
              Your keys go to this server for this one run and are not stored. A run stops at about $0.50 of
              Nebius spend.
            </p>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg border border-foreground px-5 py-2.5 font-medium hover:bg-foreground hover:text-background"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!ready}
            aria-describedby={`${id}-why`}
            className="shrink-0 rounded-lg bg-foreground px-5 py-2.5 font-medium text-background hover:bg-accent disabled:opacity-40 disabled:hover:bg-foreground"
          >
            Find the source
          </button>
        )}
        <p id={`${id}-why`} className="text-xs text-muted">
          {/* A disabled button says nothing on its own, so this line says what it's waiting for. */}
          {running || ready ? (
            "A run takes up to about three minutes."
          ) : !keysIn && mode === "trial" ? (
            "Add the access code above to run it, or use your own keys."
          ) : !keysIn ? (
            <>
              Add both keys above to run it, or{" "}
              <a href="#cases" className="underline underline-offset-2 hover:text-foreground">
                open a finished case below
              </a>
              . No keys needed there.
            </>
          ) : (
            "Paste a quote to start. A run takes up to about three minutes."
          )}
        </p>
      </div>
      {savesRuns && (
        <p className="-mt-2 text-xs text-muted">
          Every run is saved and gets a public link: the quote, what the run found and its verdict. Keys are never saved.
        </p>
      )}
    </form>
  );
}

function KeyInput({
  id,
  label,
  value,
  onChange,
  maxLength = 512,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLength}
        className={`${FIELD} px-3 py-2 font-mono text-sm`}
      />
    </div>
  );
}
