import type { EvidenceNode, RunEvent } from "../agent/events";
import { estimateCostUsd, MODELS, type TokenUsage } from "../agent/models";
import type { JudgeOutput } from "../agent/schemas";

// Folds a run's events into what the page shows. Pure, so a live stream and a
// replay of a saved run give the same screen.

export type Tier = "lightning" | "nano" | "super" | "ultra";
// The step a run reached. It stays put once the run is done, so a run that
// ended early shows where.
export type Phase = "planning" | "searching" | "reading" | "judging";
export type Agent = "Planner" | "Search" | "Reader" | "Checker" | "Judge" | "Run";
export type Tone = "neutral" | "good" | "warn" | "bad";

export type LogEntry = {
  id: number;
  agent: Agent;
  tier: Tier | null;
  text: string;
  tone: Tone;
  costUsd: number | null;
};

export type RunState = {
  phase: Phase;
  quote: string | null;
  popularAttribution: string | null;
  // Who named it: the visitor, or the planner when the visitor left it blank.
  attributionFrom: "visitor" | "planner" | null;
  plan: { variants: string[]; candidateAuthors: string[]; queries: string[] } | null;
  searches: number;
  pages: number | null;
  // Pages read at least once; a page read again counts once.
  readUrls: string[];
  nodes: EvidenceNode[];
  // The verdict that stands: the last one, when a second judge ran.
  verdict: { tier: Tier; output: JudgeOutput; unknownIds: string[] } | null;
  // Why no verdict came, when none did.
  noVerdict: string | null;
  stopped: "budget" | "aborted" | null;
  nebiusUsd: number;
  // The same calls priced at Ultra's rates, from the token counts each one
  // reported. null for runs saved before token counts were kept.
  ultraUsd: number | null;
  unknownCostCalls: number;
  tavilyCredits: number;
  seconds: number | null;
  finished: boolean;
  log: LogEntry[];
};

export const initialRunState: RunState = {
  phase: "planning",
  quote: null,
  popularAttribution: null,
  attributionFrom: null,
  plan: null,
  searches: 0,
  pages: null,
  readUrls: [],
  nodes: [],
  verdict: null,
  noVerdict: null,
  stopped: null,
  nebiusUsd: 0,
  ultraUsd: 0,
  unknownCostCalls: 0,
  tavilyCredits: 0,
  seconds: null,
  finished: false,
  log: [],
};

const VERDICT_WORDS: Record<JudgeOutput["verdict"], string> = {
  misattributed: "misattributed",
  correct: "correctly attributed",
  contested: "contested",
  no_known_source: "no known source",
};

const usd = (value: number): string => `$${value.toFixed(4)}`;

type Spend = { tier: Tier; costUsd: number; usageKnown: boolean; tokens?: TokenUsage };

export function reduceRun(state: RunState, event: RunEvent): RunState {
  const log = (agent: Agent, text: string, tone: Tone = "neutral", spend?: Spend): LogEntry[] => [
    ...state.log,
    { id: state.log.length, agent, tier: spend?.tier ?? null, text, tone, costUsd: spend ? spend.costUsd : null },
  ];
  const spent = (spend: Spend) => ({
    nebiusUsd: state.nebiusUsd + spend.costUsd,
    // A call with unknown usage adds nothing to either sum, so both still cover
    // the same calls, and the cost line says how many were left out. A call with
    // known usage but no counts comes from an older log: there the Nebius sum has
    // it and the Ultra one can't, so the comparison is dropped.
    ultraUsd:
      state.ultraUsd === null || (spend.usageKnown && !spend.tokens)
        ? null
        : state.ultraUsd + (spend.tokens ? estimateCostUsd(MODELS.ultra, spend.tokens) : 0),
    unknownCostCalls: state.unknownCostCalls + (spend.usageKnown ? 0 : 1),
  });

  switch (event.type) {
    case "started":
      return {
        ...state,
        quote: event.quote,
        popularAttribution: event.popularAttribution,
        attributionFrom: event.popularAttribution === null ? null : "visitor",
        log: log("Run", `Started. Sites that already wrote up answers are left out: ${event.excludeDomains.join(", ")}`),
      };
    case "planned": {
      // A name the visitor gave is never replaced.
      const found = state.popularAttribution === null && event.foundAttribution ? event.foundAttribution : null;
      return {
        ...state,
        ...spent(event),
        phase: "searching",
        noVerdict: null,
        plan: { variants: event.variants, candidateAuthors: event.candidateAuthors, queries: event.queries },
        ...(found && { popularAttribution: found, attributionFrom: "planner" as const }),
        log: log(
          "Planner",
          `Planned ${event.queries.length} searches and ${event.variants.length} other wordings` +
            (found ? `. No name was given; it's usually credited to ${found}` : ""),
          "neutral",
          event,
        ),
      };
    }
    case "plan_failed":
      // When the run ends here, this is why; the run going on clears it.
      return {
        ...state,
        ...spent(event),
        noVerdict: `Planning failed: ${event.reason}`,
        log: log("Planner", `Planning failed: ${event.reason}`, "bad", event),
      };
    case "escalated": {
      const how = event.from === event.to ? `again on ${event.to} with thinking off` : `again on ${event.to}`;
      const agent: Agent = event.step === "plan" ? "Planner" : event.step === "read" ? "Reader" : "Judge";
      const page = event.url ? ` (${hostOf(event.url)})` : "";
      return { ...state, log: log(agent, `Trying ${how}${page}: ${event.reason}`, "warn") };
    }
    case "searched":
      return {
        ...state,
        phase: "searching",
        noVerdict: null,
        searches: state.searches + 1,
        tavilyCredits: state.tavilyCredits + (event.credits ?? 0),
        log: log("Search", `${event.results} results for ${event.query}`),
      };
    case "search_failed":
      return { ...state, phase: "searching", noVerdict: null, log: log("Search", `Search failed (${event.reason}): ${event.query}`, "bad") };
    case "pages_ready": {
      const dropped = event.droppedExcluded ? `, ${event.droppedExcluded} from excluded sites dropped` : "";
      return { ...state, phase: "reading", pages: event.pages, log: log("Search", `${event.pages} pages to read${dropped}`) };
    }
    case "page_read": {
      const text: Record<typeof event.outcome, string> = {
        evidence: `Found the quote on ${event.host}`,
        no_quote: `No quote on ${event.host}`,
        too_long: `Page too long to read: ${event.host}`,
        failed: `Could not read ${event.host}${event.reason ? `: ${event.reason}` : ""}`,
      };
      const tone: Tone = event.outcome === "evidence" ? "good" : event.outcome === "failed" ? "bad" : "neutral";
      const readUrls = state.readUrls.includes(event.url) ? state.readUrls : [...state.readUrls, event.url];
      return { ...state, ...spent(event), readUrls, log: log("Reader", text[event.outcome], tone, event) };
    }
    case "node_added": {
      const { node } = event;
      const text =
        node.check.status === "not_found"
          ? `Crossed out ${node.id}: the reader's sentence is not on ${node.host}`
          : `Confirmed ${node.id} on ${node.host}${node.check.status === "near" ? " (close match)" : ""}`;
      return {
        ...state,
        nodes: [...state.nodes, node],
        log: log("Checker", text, node.check.status === "not_found" ? "bad" : "good"),
      };
    }
    case "judge_skipped":
      return { ...state, phase: "judging", noVerdict: event.reason, log: log("Judge", `No verdict: ${event.reason}`, "warn") };
    case "verdict": {
      const unsupported = event.unknownIds.length ? `, but it cites ${event.unknownIds.join(", ")}, which were not confirmed` : "";
      return {
        ...state,
        ...spent(event),
        phase: "judging",
        verdict: { tier: event.tier, output: event.verdict, unknownIds: event.unknownIds },
        noVerdict: null,
        log: log(
          "Judge",
          `Verdict: ${VERDICT_WORDS[event.verdict.verdict]}, ${event.verdict.confidence} confidence${unsupported}`,
          event.unknownIds.length ? "warn" : "good",
          event,
        ),
      };
    }
    case "judge_failed":
      return {
        ...state,
        ...spent(event),
        phase: "judging",
        noVerdict: state.verdict ? null : event.reason,
        log: log("Judge", `Judging failed: ${event.reason}`, "bad", event),
      };
    case "budget_exceeded":
      return {
        ...state,
        stopped: "budget",
        log: log("Run", `Stopped: estimated spend ${usd(event.spentUsd)} reached the ${usd(event.maxUsd)} limit`, "warn"),
      };
    case "aborted":
      return { ...state, stopped: "aborted", log: log("Run", "Stopped before it finished", "warn") };
    case "done":
      // The server's totals replace the running sums: they are what the run was charged.
      return {
        ...state,
        finished: true,
        nebiusUsd: event.nebiusUsd,
        tavilyCredits: event.tavilyCredits,
        unknownCostCalls: event.unknownCostCalls,
        seconds: event.seconds,
        log: log("Run", `Done in ${event.seconds}s`),
      };
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const verdictWords = (verdict: JudgeOutput["verdict"]): string => VERDICT_WORDS[verdict];

// Nodes in timeline order: dated ones oldest first, then the undated ones.
export function byDate(nodes: readonly EvidenceNode[]): EvidenceNode[] {
  return [...nodes].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
}
