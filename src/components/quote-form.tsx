"use client";

import { useId, useState } from "react";

export type QuoteRequest = {
  quote: string;
  popularAttribution: string;
  language: string;
  keys: { mode: "trial" } | { mode: "byok"; nebiusApiKey: string; tavilyApiKey: string };
};

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

type Props = {
  trialOpen: boolean;
  // Whether the server saves runs, so the form says so before one starts.
  savesRuns: boolean;
  running: boolean;
  onStart: (request: QuoteRequest) => void;
  onStop: () => void;
};

// Keys stay in this component's state: never in the URL, storage or a log.
export function QuoteForm({ trialOpen, savesRuns, running, onStart, onStop }: Props) {
  const id = useId();
  const [quote, setQuote] = useState("");
  const [popularAttribution, setPopularAttribution] = useState("");
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState<"trial" | "byok">(trialOpen ? "trial" : "byok");
  const [nebiusApiKey, setNebiusApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");

  // The name is optional: left blank, the planner says who it's usually credited to.
  const ready = quote.trim() !== "" && (mode === "trial" || (nebiusApiKey.trim() !== "" && tavilyApiKey.trim() !== ""));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (running || !ready) return;
    onStart({
      quote,
      popularAttribution,
      language,
      keys: mode === "trial" ? { mode } : { mode, nebiusApiKey, tavilyApiKey },
    });
  };

  const field = "w-full rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-foreground/40 disabled:opacity-60";

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
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
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
              className="underline decoration-line underline-offset-2 hover:text-foreground disabled:no-underline"
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
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className={`flex items-center gap-2 ${trialOpen ? "" : "text-muted"}`}>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === "trial"}
              onChange={() => setMode("trial")}
              disabled={!trialOpen}
              className="accent-accent"
            />
            Free trial{trialOpen ? ", on us" : " (off right now)"}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === "byok"}
              onChange={() => setMode("byok")}
              className="accent-accent"
            />
            My own Nebius and Tavily keys
          </label>
        </div>
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

      <div className="flex items-center gap-3">
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
            className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background hover:bg-accent disabled:opacity-40 disabled:hover:bg-foreground"
          >
            Find the source
          </button>
        )}
        <p className="text-xs text-muted">A run takes up to about three minutes.</p>
      </div>
      {savesRuns && (
        <p className="-mt-2 text-xs text-muted">
          Every run is saved and gets a public link: the quote, what the run found and its verdict. Keys are never saved.
        </p>
      )}
    </form>
  );
}

function KeyInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
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
        maxLength={512}
        className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm outline-none focus:border-foreground/40"
      />
    </div>
  );
}
