"use client";

import { ArrowRight, Square } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";

export type QuoteRequest = {
  quote: string;
  popularAttribution: string;
  language: string;
  keys: { mode: "trial"; accessCode?: string } | { mode: "byok"; nebiusApiKey: string; tavilyApiKey: string };
};

// The access code from a link like /run#code=..., which fills the field in one
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

// Quotes to try. One with a finished case opens it, since that run is already
// there to see for free. One without fills the form, and these are quotes the
// app got right in the test set, so a first run on one lands well.
export type Example = { quote: string; popularAttribution: string; language: string; caseId?: string };

export const EXAMPLES: readonly Example[] = [
  {
    quote: "I disapprove of what you say, but I will defend to the death your right to say it.",
    popularAttribution: "Voltaire",
    language: "en",
  },
  {
    quote: "Twenty years from now you will be more disappointed by the things you didn't do than by the ones you did do.",
    popularAttribution: "Mark Twain",
    language: "en",
  },
  {
    quote: "In the future, everyone will be world-famous for 15 minutes.",
    popularAttribution: "Andy Warhol",
    language: "en",
  },
  {
    quote: "Insanity is doing the same thing over and over again and expecting different results.",
    popularAttribution: "Albert Einstein",
    language: "en",
    caseId: "insanity-same-thing",
  },
  {
    quote: "Gel, gel, ne olursan ol yine gel",
    popularAttribution: "Mevlana (Rumi)",
    language: "tr",
    caseId: "gel-ne-olursan-ol",
  },
  {
    quote: "Never in the field of human conflict was so much owed by so many to so few.",
    popularAttribution: "Winston Churchill",
    language: "en",
    caseId: "so-much-owed",
  },
];

// Example quotes, as pills: ones that fill the form are solid, links to a finished case dashed.
const CHIP =
  "inline-flex items-center rounded-full border border-line px-2.5 py-1 text-foreground/85 transition-colors hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

// One choice of the who-pays control. The text takes the page color over the
// thumb when its radio is checked, and the ring shows while the keyboard is on it.
const SEGMENT =
  "relative z-10 flex cursor-pointer items-center justify-center rounded-sm px-3 py-2 text-center leading-snug text-muted transition-colors duration-200 hover:text-foreground has-checked:text-background has-disabled:cursor-not-allowed [&:has(:disabled):not(:has(:checked))]:text-muted/70 [&:has(:disabled):not(:has(:checked))]:hover:text-muted/70 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-ink";


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
  "w-full rounded-sm border border-line bg-background outline-none focus:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent-ink";

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

// The option the form starts on. An open trial costs the visitor nothing, so it
// comes first. A trial behind a code starts on the visitor's own keys instead:
// that's the option anyone can use, and an access code field as the first thing
// a visitor sees reads like a locked door. Someone with the code arrives through
// its link, which picks the trial for them.
export const initialMode = (trialOpen: boolean, needsCode: boolean): "trial" | "byok" =>
  trialOpen && !needsCode ? "trial" : "byok";

// Keys and the access code stay in this component's state: never in the URL,
// storage or a log.
export function QuoteForm({ trialOpen, needsCode, savesRuns, running, onStart, onStop }: Props) {
  const id = useId();
  const [quote, setQuote] = useState("");
  const [popularAttribution, setPopularAttribution] = useState("");
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState<"trial" | "byok">(initialMode(trialOpen, needsCode));
  const [nebiusApiKey, setNebiusApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const quoteField = useRef<HTMLTextAreaElement>(null);

  // A link with the code in it fills the field and picks the trial, on load or
  // when the link is opened in a tab already on this page, which changes only
  // the hash. The form sits below the finished cases, so a code link also moves
  // the page to it, with the cursor in the quote field: someone who followed
  // the link came to run a quote.
  useEffect(() => {
    const readLink = () => {
      const linked = accessCodeFromHash(window.location.hash) !== null;
      const code = takeCodeFromLink(window.location, window.history, { trialOpen, needsCode });
      if (linked) {
        const el = form.current;
        if (el) (el.closest("section") ?? el).scrollIntoView({ block: "start" });
        quoteField.current?.focus({ preventScroll: true });
      }
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

  const field = `${FIELD} px-3 py-2.5 disabled:opacity-60`;
  // The order the sheet's rows come in when it unfolds (globals.css, Home).
  const row = (i: number) => ({ className: "run-row", style: { "--i": i } as CSSProperties });

  return (
    <form
      ref={form}
      onSubmit={submit}
      className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
      aria-label="Look up a quote"
    >
      <div {...row(0)}>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-quote`} className="text-sm font-medium">
            The quote
          </label>
          <span aria-hidden="true" className="font-mono text-[11px] text-muted tabular-nums">
            {quote.length}/500
          </span>
        </div>
        <textarea
          ref={quoteField}
          id={`${id}-quote`}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          maxLength={500}
          rows={5}
          required
          disabled={running}
          placeholder="Paste it the way you saw it"
          className={`${field} min-h-36 resize-y font-serif text-xl leading-snug sm:text-2xl`}
        />
        <div className="mt-3 flex flex-col gap-2.5 text-xs text-muted">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1">Try a new one:</span>
            {EXAMPLES.filter((example) => !example.caseId).map((example) => (
              <button
                key={example.quote}
                type="button"
                disabled={running}
                onClick={() => {
                  setQuote(example.quote);
                  setPopularAttribution(example.popularAttribution);
                  setLanguage(example.language);
                }}
                className={`${CHIP} disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-transparent`}
              >
                {example.popularAttribution}
              </button>
            ))}
          </p>
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1">Or see one already run, no keys needed:</span>
            {EXAMPLES.flatMap((example) =>
              example.caseId
                ? [
                    <Link key={example.quote} href={`/cases/${example.caseId}`} className={`${CHIP} border-dashed`}>
                      {example.popularAttribution}
                    </Link>,
                  ]
                : [],
            )}
          </p>
        </div>
      </div>

      <div {...row(1)} className={`${row(1).className} flex flex-col gap-5`}>
        <div className="grid gap-4 sm:grid-cols-[1fr_11rem] lg:grid-cols-1 xl:grid-cols-[1fr_10rem]">
          <div>
            <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-medium">
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
            <label htmlFor={`${id}-lang`} className="mb-1.5 block text-sm font-medium">
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

        <fieldset disabled={running} className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium">Who pays for the run</legend>
          {/* A segmented control made of the two radios themselves, so the keyboard,
              the form and screen readers treat it as the radio group it is. */}
          <div className="seg relative grid auto-rows-fr rounded-sm border border-line bg-background p-1 text-sm sm:grid-cols-2">
            <span
              aria-hidden="true"
              className="seg-thumb absolute top-1 left-1 h-[calc(50%-0.25rem)] w-[calc(100%-0.5rem)] rounded-sm bg-foreground shadow-sm sm:h-[calc(100%-0.5rem)] sm:w-[calc(50%-0.25rem)]"
            />
            <label className={SEGMENT}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={mode === "trial"}
                onChange={() => setMode("trial")}
                disabled={!trialOpen}
                className="sr-only"
              />
              {!trialOpen
                ? "Free trial (not offered on this site)"
                : needsCode
                  ? "Free trial, with an access code"
                  : "Free trial, on us"}
            </label>
            <label className={SEGMENT}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={mode === "byok"}
                onChange={() => setMode("byok")}
                className="sr-only"
              />
              My own Nebius and Tavily keys
            </label>
          </div>
          {mode === "trial" && needsCode && <AccessCodeField id={`${id}-code`} value={accessCode} onChange={setAccessCode} />}
          {mode === "byok" && (
            <div className="arrive mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <KeyInput id={`${id}-nebius`} label="Nebius API key" value={nebiusApiKey} onChange={setNebiusApiKey} />
              <KeyInput id={`${id}-tavily`} label="Tavily API key" value={tavilyApiKey} onChange={setTavilyApiKey} />
              <p className="text-xs text-muted sm:col-span-2 lg:col-span-1 xl:col-span-2">
                Your keys go to this server for this one run and are not stored. A run stops at about $0.50 of
                Nebius spend.
              </p>
            </div>
          )}
        </fieldset>
      </div>

      <div {...row(2)} className={`${row(2).className} flex flex-col gap-2 border-t border-line pt-5 lg:col-span-2`}>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-2 rounded-sm border border-foreground px-5 py-3 font-medium hover:bg-foreground hover:text-background"
            >
              <Square aria-hidden="true" className="size-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!ready}
              aria-describedby={`${id}-why`}
              className="group/run inline-flex shrink-0 items-center gap-2 rounded-sm bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-40 disabled:hover:bg-foreground disabled:hover:text-background"
            >
              Find the source
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover/run:translate-x-0.5 group-disabled/run:translate-x-0"
              />
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
                <Link href="/#cases" className="underline underline-offset-2 hover:text-foreground">
                  open a finished case
                </Link>
                . No keys needed there.
              </>
            ) : (
              "Paste a quote to start. A run takes up to about three minutes."
            )}
          </p>
        </div>
        {savesRuns && (
          <p className="text-xs text-muted">
            Every run is saved and gets a public link: the quote, what the run found and its verdict. Keys are never saved.
          </p>
        )}
      </div>
    </form>
  );
}

export function AccessCodeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <KeyInput id={id} label="Access code" value={value} onChange={onChange} maxLength={200} />
      <p className="text-xs text-muted sm:col-span-2">
        Hackathon judges get the code in the testing instructions. No code? Use your own keys, or open a finished case
        above.
      </p>
    </div>
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
