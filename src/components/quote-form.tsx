"use client";

import { ArrowRight, Check, CircleAlert, CircleHelp, Eye, EyeOff, LoaderCircle, ShieldCheck, Square } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { checkKeys, IDLE, type KeyName, type KeyStatus, keyTail } from "../lib/key-check";
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
  // What the run page can ask of the form once a run has ended.
  ref?: React.Ref<QuoteFormHandle>;
};

export type QuoteFormHandle = {
  // Puts the cursor in a key's field, on the visitor's own keys.
  focusKey: (name: KeyName) => void;
  // A key a run found refused, so its field says so when the form opens again.
  markRejected: (name: KeyName) => void;
  // Picks the visitor's own keys and puts the cursor in the first empty one.
  useOwnKeys: () => void;
  // The same request again, through the same checks. Says how it went, since
  // the form may be hidden under a run and can't show a refused key itself.
  resubmit: () => Promise<Submitted>;
};

// What asking for a run came to: it started, a key was refused in the check
// before it, the form isn't filled in enough to run, or a run or check was
// already under way.
export type Submitted =
  | { outcome: "started" }
  | { outcome: "refused"; key: KeyName }
  // key: the visitor's own key that's missing or refused, when that's what is in the way.
  | { outcome: "not_ready"; key?: KeyName }
  | { outcome: "busy" };

// The option the form starts on. An open trial costs the visitor nothing, so it
// comes first. A trial behind a code starts on the visitor's own keys instead:
// that's the option anyone can use, and an access code field as the first thing
// a visitor sees reads like a locked door. Someone with the code arrives through
// its link, which picks the trial for them.
export const initialMode = (trialOpen: boolean, needsCode: boolean): "trial" | "byok" =>
  trialOpen && !needsCode ? "trial" : "byok";

// The order the page's parts come in as it opens (globals.css, Run page).
const order = (i: number) => ({ "--i": i }) as CSSProperties;

const KEY_NAMES: readonly KeyName[] = ["nebius", "tavily"];
const PROVIDER: Record<KeyName, { name: string; site: string; url: string }> = {
  nebius: { name: "Nebius", site: "tokenfactory.nebius.com", url: "https://tokenfactory.nebius.com/" },
  tavily: { name: "Tavily", site: "app.tavily.com", url: "https://app.tavily.com/" },
};

type Checked = { key: string; status: KeyStatus };
const UNCHECKED: Record<KeyName, Checked> = { nebius: { key: "", status: IDLE }, tavily: { key: "", status: IDLE } };

// Keys and the access code stay in this component's state: never in the URL,
// storage or a log. A key is checked with its provider when it is pasted in,
// when its field is left and before a run, never on each keystroke.
export function QuoteForm({ trialOpen, needsCode, savesRuns, running, onStart, onStop, ref }: Props) {
  const id = useId();
  const [quote, setQuote] = useState("");
  const [popularAttribution, setPopularAttribution] = useState("");
  const [language, setLanguage] = useState("");
  const [mode, setMode] = useState<"trial" | "byok">(initialMode(trialOpen, needsCode));
  const [nebiusApiKey, setNebiusApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [accessCode, setAccessCode] = useState("");
  // What each key's provider said, for the key it was asked about. A key typed
  // over since reads as unchecked.
  const [checks, setChecks] = useState(UNCHECKED);
  // Waiting on the checks a run starts with.
  const [preparing, setPreparing] = useState(false);
  const quoteField = useRef<HTMLTextAreaElement>(null);
  const nebiusField = useRef<HTMLInputElement>(null);
  const tavilyField = useRef<HTMLInputElement>(null);
  // A key field the run page asked for, focused once it's on the page.
  const wantFocus = useRef<KeyName | null>(null);
  // The latest of everything a check reads, so one finishing late can tell
  // whether its key is still the one in the field.
  const known = useRef(UNCHECKED);
  const inflight = useRef(new Map<KeyName, { key: string; promise: Promise<KeyStatus> }>());

  const keyOf = (name: KeyName) => (name === "nebius" ? nebiusApiKey : tavilyApiKey).trim();
  const statusOf = (name: KeyName): KeyStatus => (checks[name].key === keyOf(name) ? checks[name].status : IDLE);

  const put = (name: KeyName, key: string, status: KeyStatus) => {
    known.current = { ...known.current, [name]: { key, status } };
    setChecks(known.current);
  };

  const fieldOf = (name: KeyName) => (name === "nebius" ? nebiusField : tavilyField).current;

  // values: the keys to check, when they're newer than this render's (a paste).
  const startCheck = (names: KeyName[], values: Partial<Record<KeyName, string>> = {}) => {
    const sent = Object.fromEntries(names.map((name) => [name, values[name] ?? keyOf(name)])) as Record<KeyName, string>;
    const all = checkKeys(sent);
    for (const name of names) {
      const promise = all.then((results) => results[name] ?? ({ state: "unknown" } as const));
      inflight.current.set(name, { key: sent[name], promise });
      put(name, sent[name], { state: "checking" });
      void promise.then((status) => {
        if (inflight.current.get(name)?.promise === promise) inflight.current.delete(name);
        if (known.current[name].key === sent[name]) put(name, sent[name], status);
      });
    }
  };

  // On paste and on leaving a field: once per key.
  const checkSoon = (name: KeyName, value = keyOf(name)) => {
    const key = value.trim();
    if (!key || (known.current[name].key === key && known.current[name].status.state !== "idle")) return;
    startCheck([name], { [name]: key });
  };

  // Typing changes the key and says nothing; a paste is a whole key, so it's checked.
  const checkIfPasted = (name: KeyName, event: React.ChangeEvent<HTMLInputElement>) => {
    if ((event.nativeEvent as InputEvent).inputType === "insertFromPaste") checkSoon(name, event.target.value);
  };

  useEffect(() => {
    const name = wantFocus.current;
    if (!name) return;
    wantFocus.current = null;
    fieldOf(name)?.focus();
  });
  const focusField = (name: KeyName) => {
    const field = fieldOf(name);
    if (field && mode === "byok") return field.focus();
    wantFocus.current = name;
    setMode("byok");
  };

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
  const rejected = mode === "byok" ? KEY_NAMES.find((name) => statusOf(name).state === "rejected") : undefined;
  const checking = mode === "byok" && KEY_NAMES.some((name) => statusOf(name).state === "checking");
  // The name is optional: left blank, the planner says who it's usually credited to.
  const keysIn = mode === "trial" ? codeIn : nebiusApiKey.trim() !== "" && tavilyApiKey.trim() !== "";
  const ready = quoteIn && keysIn && !rejected;

  const request = (): QuoteRequest => ({
    quote,
    popularAttribution,
    language: language || null,
    keys: mode === "trial" ? (needsCode ? { mode, accessCode } : { mode }) : { mode, nebiusApiKey, tavilyApiKey },
  });

  // A run on the visitor's own keys starts once both have an answer. A refused
  // key stops it here, before anything is spent; one that couldn't be checked
  // lets it go, since the run itself will say if the key is wrong.
  const go = async (): Promise<Submitted> => {
    if (running || preparing) return { outcome: "busy" };
    if (!ready) {
      const gap = quoteIn ? (rejected ?? (mode === "byok" ? KEY_NAMES.find((name) => !keyOf(name)) : undefined)) : undefined;
      return gap ? { outcome: "not_ready", key: gap } : { outcome: "not_ready" };
    }
    if (mode === "trial") {
      onStart(request());
      return { outcome: "started" };
    }
    const sent = request();
    const need = KEY_NAMES.filter((name) => {
      const { key, status } = known.current[name];
      return key !== keyOf(name) || status.state === "idle" || status.state === "unknown";
    });
    if (need.length) startCheck(need);
    setPreparing(true);
    const statuses = await Promise.all(
      KEY_NAMES.map((name) => {
        const pending = inflight.current.get(name);
        return pending && pending.key === keyOf(name) ? pending.promise : Promise.resolve(known.current[name].status);
      }),
    );
    setPreparing(false);
    const refused = KEY_NAMES.find((_, i) => statuses[i].state === "rejected");
    if (refused) {
      // Focused once the fields are unlocked again, after this render.
      wantFocus.current = refused;
      return { outcome: "refused", key: refused };
    }
    onStart(sent);
    return { outcome: "started" };
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void go();
  };

  useImperativeHandle(ref, () => ({
    focusKey: focusField,
    markRejected: (name) => {
      const key = keyOf(name);
      if (key) put(name, key, { state: "rejected" });
    },
    useOwnKeys: () => focusField(KEY_NAMES.find((name) => !keyOf(name)) ?? "nebius"),
    resubmit: go,
  }));

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
      <div className="grid gap-x-12 gap-y-10 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="run-in min-w-0" style={order(4)}>
          <div className="mb-3 flex items-center gap-2.5">
            <StepMark n={1} done={quoteIn} />
            <label htmlFor={`${id}-quote`} className="text-lg font-medium">
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
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

        {/* Locked while the keys are checked before a run, so the run starts with the keys that were checked. */}
        <fieldset disabled={running || preparing} className="run-in min-w-0" style={order(5)}>
          <legend className="mb-3 flex items-center gap-2.5 text-lg font-medium">
            {/* Ticked once the keys are in and none is refused or still being asked about. */}
            <StepMark n={2} done={keysIn && !rejected && !checking} />
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
                ? "Trial runs are paid with the site's own keys, and they aren't switched on here. Use your own keys, or open a finished case."
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
            <div className="arrive mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <KeyField
                id={`${id}-nebius`}
                name="nebius"
                label="Nebius API key"
                value={nebiusApiKey}
                status={statusOf("nebius")}
                running={running}
                inputRef={nebiusField}
                onChange={(e) => {
                  setNebiusApiKey(e.target.value);
                  checkIfPasted("nebius", e);
                }}
                onBlur={() => checkSoon("nebius")}
              />
              <KeyField
                id={`${id}-tavily`}
                name="tavily"
                label="Tavily API key"
                value={tavilyApiKey}
                status={statusOf("tavily")}
                running={running}
                inputRef={tavilyField}
                onChange={(e) => {
                  setTavilyApiKey(e.target.value);
                  checkIfPasted("tavily", e);
                }}
                onBlur={() => checkSoon("tavily")}
              />
              <p className="flex gap-2 text-xs leading-relaxed text-muted sm:col-span-2 lg:col-span-1">
                <ShieldCheck aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                <span>
                  Each key is checked with its provider when you paste it, at no cost. Keys go to this server for this
                  one run, are never stored, and a run stops at about $0.50 of Nebius spend.
                </span>
              </p>
            </div>
          )}
        </fieldset>
      </div>

      <div
        className="run-in flex flex-col items-start gap-3 border-t border-line px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-8"
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
            disabled={!ready || preparing}
            aria-describedby={`${id}-why`}
            className="group/run inline-flex shrink-0 items-center gap-2 rounded-sm bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-40 disabled:hover:bg-foreground disabled:hover:text-background"
          >
            {preparing ? "Checking your keys" : "Find the source"}
            {preparing ? (
              <LoaderCircle aria-hidden="true" className="key-spin size-4" />
            ) : (
              <ArrowRight
                aria-hidden="true"
                className="run-go size-4 transition-transform duration-200 group-hover/run:translate-x-0.5 group-disabled/run:translate-x-0"
              />
            )}
          </button>
        )}
        <div className="flex flex-col gap-1 text-xs text-muted">
          <p id={`${id}-why`}>
            {/* A disabled button says nothing on its own, so this line says what it's waiting for. */}
            {running ? (
              "Starting the run. It takes the form's place as soon as the Planner begins."
            ) : rejected ? (
              `${PROVIDER[rejected].name} rejected the key above. Fix it to run.`
            ) : ready ? (
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
  // The radio is named by the title alone; the tag and the line under it are
  // its description, so a screen reader doesn't read a sentence as a name.
  const id = useId();
  return (
    <label
      className={cn(
        "pay-card flex cursor-pointer gap-3 rounded-sm border border-line bg-background p-4 transition-colors duration-200 hover:border-foreground/40 has-checked:border-foreground has-checked:bg-card has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-ink",
        disabled && "cursor-not-allowed border-dashed bg-transparent hover:border-line",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={tag ? `${id}-tag ${id}-text` : `${id}-text`}
        className="sr-only"
      />
      <span aria-hidden="true" className="pay-dot mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line">
        <span className="pay-dot-fill size-2 rounded-full bg-foreground" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug font-medium">
          <span id={`${id}-title`} className={disabled ? "text-muted" : undefined}>
            {title}
          </span>
          {tag && (
            <span id={`${id}-tag`} className="rounded-full border border-line px-2 py-px text-[11px] font-normal text-muted">
              {tag}
            </span>
          )}
        </span>
        <span id={`${id}-text`} className="text-xs leading-relaxed text-muted">
          {children}
        </span>
      </span>
    </label>
  );
}

export function AccessCodeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="arrive mt-5 grid gap-2">
      <SecretInput id={id} label="Access code" value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} />
      <p className="text-xs leading-relaxed text-muted">
        Hackathon judges get the code in the testing instructions. No code? Use your own keys, or open a finished
        case.
      </p>
    </div>
  );
}

// A key or code field: a password field with a show and hide button, so what's
// in it shows only when the visitor asks. Shown text goes back to dots once a
// run starts. status draws the field's edge and the icon at its end.
function SecretInput({
  id,
  label,
  value,
  onChange,
  maxLength = 512,
  status = IDLE,
  running = false,
  describedBy,
  inputRef,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  maxLength?: number;
  status?: KeyStatus;
  running?: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onBlur?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [wasRunning, setWasRunning] = useState(running);
  if (running !== wasRunning) {
    setWasRunning(running);
    if (running) setShown(false);
  }
  const lowOnCredits = status.state === "works" && status.creditsLeft === 0;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div
        data-state={status.state}
        className={cn(
          "key-box flex items-center rounded-sm border bg-background transition-colors duration-200 focus-within:border-foreground/40 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent-ink",
          status.state === "rejected" ? "border-bad focus-within:border-bad" : lowOnCredits ? "border-warn" : "border-line",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={maxLength}
          aria-invalid={status.state === "rejected" || undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm outline-none"
        />
        {/* The check's state at the field's end, each icon fading in over the
            last: the status icons from ddoemonn's Inline Validation on 21st.dev. */}
        <span aria-hidden="true" className="key-icons grid size-4 shrink-0 place-items-center">
          <LoaderCircle className="key-icon key-spin size-4 text-muted" data-for="checking" />
          <Check className={cn("key-icon size-4", lowOnCredits ? "text-warn" : "text-good")} strokeWidth={2.5} data-for="works" />
          <CircleAlert className="key-icon size-4 text-bad" data-for="rejected" />
          <CircleHelp className="key-icon size-4 text-muted" data-for="unknown" />
        </span>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls={id}
          aria-label={shown ? `Hide ${label}` : `Show ${label}`}
          className="mx-1 grid size-8 shrink-0 place-items-center rounded-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-ink"
        >
          {shown ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </div>
  );
}

// A visitor's own key, with what its provider said under it.
function KeyField({
  id,
  name,
  label,
  value,
  status,
  ...rest
}: {
  id: string;
  name: KeyName;
  label: string;
  value: string;
  status: KeyStatus;
  running: boolean;
  inputRef: React.Ref<HTMLInputElement>;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  return (
    <div>
      <SecretInput id={id} label={label} value={value} status={status} describedBy={`${id}-status`} {...rest} />
      {/* Read aloud as it changes, and swapped in place, so the field below doesn't jump. */}
      <p id={`${id}-status`} aria-live="polite" className="mt-1.5 min-h-[1lh] text-xs leading-relaxed">
        <KeyLine key={status.state} name={name} value={value} status={status} />
      </p>
    </div>
  );
}

function KeyLine({ name, value, status }: { name: KeyName; value: string; status: KeyStatus }) {
  const { name: provider, site, url } = PROVIDER[name];
  const where = (
    <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
      {site}
    </a>
  );
  const tail = keyTail(value);
  switch (status.state) {
    case "checking":
      return <span className="key-line text-muted">Checking with {provider}…</span>;
    case "works": {
      if (status.creditsLeft === 0) {
        return (
          <span className="key-line text-warn">
            {provider} accepted it, but it has no credits left, so searches will fail. Add some at {where}.
          </span>
        );
      }
      const credits = status.creditsLeft !== null ? `, ${status.creditsLeft.toLocaleString("en")} credits left` : "";
      return (
        <span className="key-line">
          <span className="text-good">Works.</span>{" "}
          <span className="text-muted">
            {provider} accepted the key{tail ? ` ending in ${tail}` : ""}
            {credits}.
          </span>
        </span>
      );
    }
    case "rejected":
      return (
        <span className="key-line text-bad">
          {provider} rejected this key. Copy it again from {where}, with nothing missing at either end.
        </span>
      );
    case "unknown":
      return <span className="key-line text-muted">Couldn&apos;t check it just now. The run will still try it.</span>;
    default:
      return <span className="text-muted">Get one at {where}.</span>;
  }
}
