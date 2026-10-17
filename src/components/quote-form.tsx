"use client";

import { ArrowRight, Check, Square } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { cn } from "../lib/utils";

export type QuoteRequest = {
  quote: string;
  popularAttribution: string;
  // null when the visitor isn't sure; the planner works it out from the quote.
  language: string | null;
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

// The quotes that already have a finished case, as links to it. The run page
// shows them by its heading, for a visitor with no keys.
export function CaseLinks({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted", className)} style={style}>
      <span className="mr-1">No keys? See one already run:</span>
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
  );
}

// The first choice, and the one the form starts on, sends no language.
const LANGUAGES = [
  ["", "Not sure"],
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

// The order the page's parts come in as it opens (globals.css, Run page).
const order = (i: number) => ({ "--i": i }) as CSSProperties;

// Keys and the access code stay in this component's state: never in the URL,
// storage or a log.
export function QuoteForm({ trialOpen, needsCode, savesRuns, running, onStart, onStop }: Props) {
  const id = useId();
  const [quote, setQuote] = useState("");
  const [popularAttribution, setPopularAttribution] = useState("");
  const [language, setLanguage] = useState("");
  const [mode, setMode] = useState<"trial" | "byok">(initialMode(trialOpen, needsCode));
  const [nebiusApiKey, setNebiusApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const quoteField = useRef<HTMLTextAreaElement>(null);

  // A link with the code in it fills the field and picks the trial, on load or
  // when the link is opened in a tab already on this page, which changes only
  // the hash. Someone who followed the link came to run a quote, so the cursor
  // goes into the quote field.
  useEffect(() => {
    const readLink = () => {
      const linked = accessCodeFromHash(window.location.hash) !== null;
      const code = takeCodeFromLink(window.location, window.history, { trialOpen, needsCode });
      if (linked) quoteField.current?.focus({ preventScroll: true });
      if (code === null) return;
      setAccessCode(code);
      setMode("trial");
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, [trialOpen, needsCode]);

  const quoteIn = quote.trim() !== "";
  const codeIn = !needsCode || accessCode.trim() !== "";
  // The name is optional: left blank, the planner says who it's usually credited to.
  const keysIn = mode === "trial" ? codeIn : nebiusApiKey.trim() !== "" && tavilyApiKey.trim() !== "";
  const ready = quoteIn && keysIn;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (running || !ready) return;
    onStart({
      quote,
      popularAttribution,
      language: language || null,
      keys: mode === "trial" ? (needsCode ? { mode, accessCode } : { mode }) : { mode, nebiusApiKey, tavilyApiKey },
    });
  };

  const field = `${FIELD} px-3 py-2.5 disabled:opacity-60`;
  const trialTitle = !trialOpen ? "Free trial" : needsCode ? "Free trial, with an access code" : "Free trial, on us";

  return (
    <form
      onSubmit={submit}
      data-ready={ready || undefined}
      className="run-in rounded-sm border border-line bg-card shadow-sm"
      style={order(3)}
      aria-label="Look up a quote"
    >
      <div className="grid gap-x-10 gap-y-9 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="run-in min-w-0" style={order(4)}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <StepMark n={1} done={quoteIn} />
            <label htmlFor={`${id}-quote`} className="font-medium">
              The quote
            </label>
          </div>
          {/* The field and its examples are one box, the docked bottom row from
              sean0205's Textarea Input Group on 21st.dev; the box takes the
              focus ring the field would have. */}
          <div className="rounded-sm border border-line bg-background transition-colors focus-within:border-foreground/40 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-accent-ink">
            <textarea
              ref={quoteField}
              id={`${id}-quote`}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={500}
              rows={4}
              required
              disabled={running}
              placeholder="Paste it the way you saw it"
              className="block min-h-32 w-full resize-y bg-transparent px-4 pt-3.5 pb-2 font-serif text-xl leading-snug outline-none placeholder:text-muted/80 disabled:opacity-60 sm:text-2xl"
            />
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5 text-xs text-muted">
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
              <span aria-hidden="true" className="ml-auto pl-2 font-mono text-[11px] tabular-nums">
                {quote.length}/500
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                Language of the quote <span className="font-normal text-muted">(optional)</span>
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
        </div>

        <fieldset disabled={running} className="run-in min-w-0" style={order(5)}>
          <legend className="mb-2.5 flex items-center gap-2.5 font-medium">
            <StepMark n={2} done={keysIn} />
            Who pays for the run
          </legend>
          {/* The two ways to pay as cards, after sean0205's Icon Card Radio Group
              on 21st.dev: each says what it is, and the trial says why when it's off. */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <PayCard
              name={`${id}-mode`}
              checked={mode === "trial"}
              disabled={!trialOpen}
              onSelect={() => setMode("trial")}
              title={trialTitle}
              tag={trialOpen ? undefined : "Not offered on this site"}
            >
              {!trialOpen
                ? "Trial runs are paid with the site's own keys, and they aren't switched on here. Use your own keys, or see a run already made."
                : needsCode
                  ? "Paid with the site's keys, for hackathon judges and others given a code."
                  : "Paid with the site's keys, from a small daily budget. Nothing to set up."}
            </PayCard>
            <PayCard
              name={`${id}-mode`}
              checked={mode === "byok"}
              onSelect={() => setMode("byok")}
              title="My own Nebius and Tavily keys"
            >
              Works on any copy of the site. Your keys are used for this one run and never stored.
            </PayCard>
          </div>
          {mode === "trial" && needsCode && <AccessCodeField id={`${id}-code`} value={accessCode} onChange={setAccessCode} />}
          {mode === "byok" && (
            <div className="arrive mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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

      <div
        className="run-in flex flex-col items-start gap-3 border-t border-line px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-7"
        style={order(6)}
      >
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-foreground px-5 py-3 font-medium hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <Square aria-hidden="true" className="size-3.5 fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!ready}
            aria-describedby={`${id}-why`}
            className="group/run inline-flex shrink-0 items-center gap-2 rounded-sm bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-40 disabled:hover:bg-foreground disabled:hover:text-background"
          >
            Find the source
            <ArrowRight
              aria-hidden="true"
              className="run-go size-4 transition-transform duration-200 group-hover/run:translate-x-0.5 group-disabled/run:translate-x-0"
            />
          </button>
        )}
        <div className="flex flex-col gap-1 text-xs text-muted">
          <p id={`${id}-why`}>
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
          {savesRuns && (
            <p>Every run is saved and gets a public link: the quote, what the run found and its verdict. Keys are never saved.</p>
          )}
        </div>
      </div>
    </form>
  );
}

// A step's number, which turns into a tick once that part of the form is
// filled in: the check indicator from sean0205's Vertical Titled Stepper on
// 21st.dev, without the stepping, since every part is open at once.
function StepMark({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-done={done || undefined}
      className="step-mark relative grid size-6 shrink-0 place-items-center rounded-full border border-line font-mono text-[11px] font-normal text-muted transition-colors duration-300 data-done:border-good data-done:text-good"
    >
      <span className="step-n">{n}</span>
      <Check className="step-tick absolute size-3.5" strokeWidth={2.5} />
    </span>
  );
}

// One way to pay. The card is the radio's label, so the keyboard, the form and
// screen readers treat the cards as the radio group they are.
function PayCard({
  name,
  checked,
  disabled = false,
  onSelect,
  title,
  tag,
  children,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  tag?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "pay-card flex cursor-pointer gap-3 rounded-sm border border-line bg-background p-3.5 transition-colors duration-200 hover:border-foreground/40 has-checked:border-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-ink",
        disabled && "cursor-not-allowed border-dashed bg-transparent hover:border-line",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled} className="sr-only" />
      <span aria-hidden="true" className="pay-dot mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line">
        <span className="pay-dot-fill size-2 rounded-full bg-foreground" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug font-medium">
          <span className={disabled ? "text-muted" : undefined}>{title}</span>
          {tag && (
            <span className="rounded-full border border-line px-2 py-px text-[11px] font-normal text-muted">{tag}</span>
          )}
        </span>
        <span className="text-xs leading-relaxed text-muted">{children}</span>
      </span>
    </label>
  );
}

export function AccessCodeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="arrive mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <KeyInput id={id} label="Access code" value={value} onChange={onChange} maxLength={200} />
      <p className="text-xs text-muted sm:col-span-2 lg:col-span-1 xl:col-span-2">
        Hackathon judges get the code in the testing instructions. No code? Use your own keys, or see a run already
        made.
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
