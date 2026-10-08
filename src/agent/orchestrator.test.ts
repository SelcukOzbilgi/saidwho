import { describe, expect, it } from "vitest";

import type { ChatParams, NebiusClient } from "../lib/server/providers/nebius";
import type { TavilyClient } from "../lib/server/providers/tavily";
import { type RunEvent, runEventSchema } from "./events";
import { MODELS } from "./models";
import { investigate } from "./orchestrator";
import type { JudgeOutput, PlannerOutput, ReaderOutput } from "./schemas";

const QUOTE = "Insanity is doing the same thing over and over again and expecting different results";
// Page text that must never reach an event: events are stored and streamed.
const SECRET = "SENTINEL-PAGE-BODY-7f3a";
const PAGE_TEXT = `Knoxville News-Sentinel, 1981. ${SECRET} At the meeting a speaker said: "${QUOTE}." ${SECRET}`;

// One model call as the fake sees it, so a reply can depend on the model and thinking setting.
type Call = { name: string; model: string; thinking: boolean; user: string };
// null is a failed call (a provider error), "auth" a rejected key and "length" a
// call that ran out of tokens.
type Reply<T> = T | null | "auth" | "length";

type Replies = {
  plan?: (call: Call) => Reply<PlannerOutput>;
  read?: (call: Call) => Reply<ReaderOutput>;
  verdict?: (call: Call) => Reply<JudgeOutput>;
  // Milliseconds a reader call takes, by its prompt.
  readDelay?: (user: string) => number;
};

const PLAN: PlannerOutput = { variants: [], candidate_authors: ["Albert Einstein"], queries: ["origin of the insanity quote"] };
const READ: ReaderOutput = {
  contains_quote: true,
  exact_snippet: QUOTE,
  attributed_to: null,
  page_date: "1981",
  cited_source: null,
  cited_source_date: null,
};
const VERDICT: JudgeOutput = {
  verdict: "misattributed",
  earliest_node: "n1",
  earliest_author: null,
  earliest_date: "1981",
  misattribution_node: null,
  confidence: "medium",
  rationale: "The 1981 newspaper [n1] has it with no credit to Einstein.",
};

function fakeNebius(replies: Replies = {}): NebiusClient & { calls: string[]; log: Call[]; prompts: Map<string, string> } {
  const calls: string[] = [];
  const log: Call[] = [];
  const prompts = new Map<string, string>();
  return {
    calls,
    log,
    prompts,
    listModels: async () => ({ ok: true, ids: [] }),
    chat: async (params: ChatParams) => {
      const format = params.response_format as { json_schema: { name: string } };
      const name = format.json_schema.name;
      const user = String(params.messages.at(-1)?.content ?? "");
      const kwargs = params.chat_template_kwargs as { enable_thinking: boolean };
      const call = { name, model: params.model, thinking: kwargs.enable_thinking, user };
      calls.push(name);
      log.push(call);
      prompts.set(name, user);
      if (name === "read_page") await new Promise((resolve) => setTimeout(resolve, replies.readDelay?.(user) ?? 0));
      const reply =
        name === "plan"
          ? (replies.plan ?? (() => PLAN))(call)
          : name === "read_page"
            ? (replies.read ?? (() => READ))(call)
            : (replies.verdict ?? (() => VERDICT))(call);
      if (reply === null || reply === "auth") {
        const kind = reply === "auth" ? "auth" : "upstream";
        return { ok: false, error: { provider: "nebius", kind, message: "boom" }, latencyMs: 5 } as never;
      }
      const completion = {
        choices: [{ finish_reason: reply === "length" ? "length" : "stop", message: { content: reply === "length" ? "" : JSON.stringify(reply) } }],
        usage: { prompt_tokens: 1_000, completion_tokens: 100 },
      };
      return { ok: true, completion, latencyMs: 5 } as never;
    },
  };
}

function fakeTavily(urls: readonly string[] = ["https://news.example.org/1981"]): TavilyClient {
  return {
    extract: async () => {
      throw new Error("not used");
    },
    search: async () =>
      ({
        ok: true,
        latencyMs: 5,
        data: { results: urls.map((url) => ({ url, title: "News-Sentinel archive", rawContent: PAGE_TEXT })), usage: { credits: 1 } },
      }) as never,
  };
}

const INPUT = { quote: QUOTE, popularAttribution: "Albert Einstein", language: "en", excludeDomains: ["quoteinvestigator.com"] };

async function run(options: { nebius?: NebiusClient; tavily?: TavilyClient; maxUsd?: number; signal?: AbortSignal } = {}) {
  const events: RunEvent[] = [];
  await investigate({
    nebius: options.nebius ?? fakeNebius(),
    tavily: options.tavily ?? fakeTavily(),
    input: INPUT,
    maxUsd: options.maxUsd,
    signal: options.signal,
    onEvent: (event) => events.push(event),
  });
  return events;
}

const types = (events: readonly RunEvent[]) => events.map((e) => e.type);

describe("investigate", () => {
  it("reports each step in order and ends with a verdict", async () => {
    const events = await run();
    expect(types(events)).toEqual([
      "started",
      "planned",
      "searched",
      "searched",
      "pages_ready",
      "page_read",
      "node_added",
      "verdict",
      "done",
    ]);
    for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict?.type === "verdict" && verdict.unknownIds).toEqual([]);
  });

  it("never puts page text in an event", async () => {
    const events = await run();
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it("drops a reading whose date field is long enough to be page text", async () => {
    const events = await run({ nebius: fakeNebius({ read: () => ({ ...READ, page_date: PAGE_TEXT.repeat(5) }) }) });
    expect(events.find((e) => e.type === "page_read")).toMatchObject({ outcome: "too_long" });
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it("numbers nodes by search order, not by which reader finishes first", async () => {
    const nebius = fakeNebius({ readDelay: (user) => (user.includes("/first") ? 30 : 0) });
    const events = await run({ nebius, tavily: fakeTavily(["https://a.example.org/first", "https://b.example.org/second"]) });
    const added = events.flatMap((e) => (e.type === "node_added" ? [`${e.node.id} ${e.node.host}`] : []));
    expect(added).toEqual(["n2 b.example.org", "n1 a.example.org"]);
    const prompt = nebius.prompts.get("verdict") ?? "";
    expect(prompt.indexOf('"n1"')).toBeGreaterThan(-1);
    expect(prompt.indexOf('"n1"')).toBeLessThan(prompt.indexOf('"n2"'));
  });

  it("says why it stopped when cancelled during the last reader", async () => {
    const controller = new AbortController();
    const nebius = fakeNebius({
      read: () => {
        controller.abort();
        return { ...READ, contains_quote: false, exact_snippet: null };
      },
    });
    const events = await run({ nebius, signal: controller.signal });
    expect(types(events).slice(-3)).toEqual(["page_read", "aborted", "done"]);
  });

  it("reports a stop only after the readers still running have finished", async () => {
    const controller = new AbortController();
    const nebius = fakeNebius({
      readDelay: (user) => (user.includes("/p1") ? 0 : 20),
      read: ({ user }) => {
        if (user.includes("/p1")) controller.abort();
        return READ;
      },
    });
    const urls = [1, 2, 3, 4, 5, 6].map((i) => `https://site${i}.example.org/p${i}`);
    const events = await run({ nebius, tavily: fakeTavily(urls), signal: controller.signal });
    const kinds = types(events);
    // Five readers start at once; the sixth page is never read.
    expect(kinds.filter((k) => k === "page_read")).toHaveLength(5);
    expect(kinds.indexOf("aborted")).toBeGreaterThan(kinds.lastIndexOf("node_added"));
    expect(kinds.slice(-2)).toEqual(["aborted", "done"]);
  });

  it("stops before the judge once the readers use up the budget", async () => {
    const nebius = fakeNebius();
    const events = await run({ nebius, maxUsd: 0.0004 });
    expect(nebius.calls).toEqual(["plan", "read_page"]);
    expect(types(events).slice(-2)).toEqual(["budget_exceeded", "done"]);
  });

  it("cuts an over-long page title", async () => {
    const tavily: TavilyClient = {
      ...fakeTavily(),
      search: async () =>
        ({
          ok: true,
          latencyMs: 5,
          data: { results: [{ url: "https://news.example.org/1981", title: `Archive ${"x".repeat(5_000)}`, rawContent: PAGE_TEXT }] },
        }) as never,
    };
    const node = (await run({ tavily })).find((e) => e.type === "node_added");
    expect(node?.type === "node_added" && node.node.title.length).toBe(300);
  });

  it("plans again with thinking off when thinking uses up the tokens", async () => {
    const nebius = fakeNebius({ plan: ({ thinking }) => (thinking ? "length" : PLAN) });
    const events = await run({ nebius });
    expect(types(events).slice(0, 5)).toEqual(["started", "plan_failed", "escalated", "planned", "searched"]);
    expect(events[2]).toMatchObject({ step: "plan", from: "super", to: "super", thinking: false, reason: "ran out of tokens" });
    expect(nebius.log.filter((c) => c.name === "plan").map((c) => c.thinking)).toEqual([true, false]);
    expect(events.at(-2)?.type).toBe("verdict");
  });

  it("searches for the exact quote alone when both plans fail", async () => {
    const tavily = fakeTavily();
    const searched: string[] = [];
    const events = await run({
      nebius: fakeNebius({ plan: () => null }),
      tavily: { ...tavily, search: async (query, options) => (searched.push(query), tavily.search(query, options)) },
    });
    expect(types(events).slice(0, 5)).toEqual(["started", "plan_failed", "escalated", "plan_failed", "searched"]);
    expect(types(events)).not.toContain("planned");
    expect(searched).toEqual([`"${QUOTE}"`]);
    expect(events.at(-2)?.type).toBe("verdict");
  });

  it("does not plan again when the key is rejected", async () => {
    const nebius = fakeNebius({ plan: () => "auth" });
    const events = await run({ nebius });
    expect(types(events)).toEqual(["started", "plan_failed", "done"]);
    expect(nebius.calls).toEqual(["plan"]);
  });

  it("does not plan again once the first plan uses up the budget", async () => {
    const nebius = fakeNebius({ plan: () => "length" });
    const events = await run({ nebius, maxUsd: 0.0001 });
    expect(types(events)).toEqual(["started", "plan_failed", "budget_exceeded", "done"]);
    expect(nebius.calls).toEqual(["plan"]);
  });

  it("reads a page again on Super when Lightning's snippet is not on the page", async () => {
    const tidied = "Einstein said doing the same thing twice is madness itself";
    const nebius = fakeNebius({
      read: ({ model }) => (model === MODELS.lightning.id ? { ...READ, exact_snippet: tidied } : READ),
    });
    const events = await run({ nebius });
    const start = types(events).indexOf("page_read");
    expect(types(events).slice(start, start + 5)).toEqual(["page_read", "escalated", "page_read", "node_added", "verdict"]);
    expect(events[start + 1]).toMatchObject({ step: "read", from: "lightning", to: "super", url: "https://news.example.org/1981" });
    expect(events[start + 2]).toMatchObject({ tier: "super", outcome: "evidence" });
    const node = events.find((e) => e.type === "node_added");
    expect(node?.type === "node_added" && node.node.check.status).toBe("exact");
  });

  it("reads a page again on Super when Lightning's call fails", async () => {
    const nebius = fakeNebius({ read: ({ model }) => (model === MODELS.lightning.id ? null : READ) });
    const events = await run({ nebius });
    expect(events.filter((e) => e.type === "page_read").map((e) => e.type === "page_read" && e.outcome)).toEqual([
      "failed",
      "evidence",
    ]);
    expect(events.filter((e) => e.type === "node_added")).toHaveLength(1);
  });

  it("does not read a page again when it has no quote", async () => {
    const nebius = fakeNebius({ read: () => ({ ...READ, contains_quote: false, exact_snippet: null }) });
    const events = await run({ nebius });
    expect(types(events)).not.toContain("escalated");
    expect(nebius.calls.filter((c) => c === "read_page")).toHaveLength(1);
  });

  it("keeps the crossed-out node and reads no further once the budget is spent", async () => {
    const nebius = fakeNebius({ read: () => ({ ...READ, exact_snippet: "Einstein said doing the same thing twice is madness itself" }) });
    const events = await run({ nebius, maxUsd: 0.00045 });
    expect(types(events).slice(-4)).toEqual(["page_read", "node_added", "budget_exceeded", "done"]);
    expect(nebius.calls).toEqual(["plan", "read_page"]);
  });

  it("skips the judge when no snippet is found on its page", async () => {
    const nebius = fakeNebius({ read: () => ({ ...READ, exact_snippet: "Einstein said doing the same thing twice is madness itself" }) });
    const events = await run({ nebius });
    expect(types(events).slice(-2)).toEqual(["judge_skipped", "done"]);
    expect(nebius.calls).not.toContain("verdict");
    // Super read it again and failed too; the page still gives one, crossed-out node.
    expect(events.filter((e) => e.type === "node_added")).toHaveLength(1);
    expect(nebius.log.filter((c) => c.name === "read_page").map((c) => c.model)).toEqual([MODELS.lightning.id, MODELS.super.id]);
  });

  it("flags a verdict that cites a node that does not exist and asks Ultra", async () => {
    const nebius = fakeNebius({
      verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, rationale: "See [n1] and [n9]." } : VERDICT),
    });
    const events = await run({ nebius });
    expect(types(events).slice(-4)).toEqual(["verdict", "escalated", "verdict", "done"]);
    const verdicts = events.flatMap((e) => (e.type === "verdict" ? [[e.tier, e.unknownIds]] : []));
    expect(verdicts).toEqual([
      ["super", ["n9"]],
      ["ultra", []],
    ]);
    expect(events.at(-3)).toMatchObject({ step: "judge", from: "super", to: "ultra", thinking: true });
  });

  it("does not ask Ultra about a verdict that stands, even with low confidence", async () => {
    const nebius = fakeNebius({ verdict: () => ({ ...VERDICT, confidence: "low" }) });
    await run({ nebius });
    expect(nebius.log.map((c) => c.model)).not.toContain(MODELS.ultra.id);
  });

  it("judges again with thinking off when thinking uses up the tokens", async () => {
    const nebius = fakeNebius({ verdict: ({ thinking }) => (thinking ? "length" : VERDICT) });
    const events = await run({ nebius });
    expect(types(events).slice(-4)).toEqual(["judge_failed", "escalated", "verdict", "done"]);
    expect(events.at(-3)).toMatchObject({ from: "super", to: "super", thinking: false });
    expect(nebius.log.filter((c) => c.name === "verdict").map((c) => [c.model, c.thinking])).toEqual([
      [MODELS.super.id, true],
      [MODELS.super.id, false],
    ]);
  });

  it("keeps Super's verdict when Ultra fails", async () => {
    const nebius = fakeNebius({
      verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, rationale: "See [n9]." } : null),
    });
    const events = await run({ nebius });
    expect(types(events).slice(-4)).toEqual(["verdict", "escalated", "judge_failed", "done"]);
    expect(events.at(-2)).toMatchObject({ tier: "ultra" });
  });

  it("does not ask Ultra once the budget is spent", async () => {
    const nebius = fakeNebius({ verdict: () => ({ ...VERDICT, rationale: "See [n9]." }) });
    // Plan, one read and the first verdict fit; nothing after them does.
    const events = await run({ nebius, maxUsd: 0.0008 });
    expect(types(events).slice(-3)).toEqual(["verdict", "budget_exceeded", "done"]);
    expect(nebius.calls).toEqual(["plan", "read_page", "verdict"]);
  });

  it("counts a failed search as a call with unknown cost", async () => {
    const tavily: TavilyClient = {
      ...fakeTavily(),
      search: async () => ({ ok: false, latencyMs: 5, error: { provider: "tavily", kind: "timeout", message: "slow" } }) as never,
    };
    const events = await run({ tavily });
    expect(events.filter((e) => e.type === "search_failed")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "done", unknownCostCalls: 2 });
  });

  it("drops pages on an excluded site even if the search returns them", async () => {
    const tavily = fakeTavily(["https://www.quoteinvestigator.com/2017/03/23/same/", "https://news.example.org/1981"]);
    const events = await run({ tavily });
    expect(events.find((e) => e.type === "pages_ready")).toMatchObject({ pages: 1, droppedExcluded: 1 });
    expect(events.filter((e) => e.type === "page_read")).toHaveLength(1);
  });

  it("starts no model call once the budget is spent", async () => {
    const nebius = fakeNebius();
    const events = await run({ nebius, maxUsd: 0.000_01 });
    expect(nebius.calls).toEqual(["plan"]);
    expect(types(events).slice(-2)).toEqual(["budget_exceeded", "done"]);
  });

  it("starts nothing when already aborted", async () => {
    const nebius = fakeNebius();
    const events = await run({ nebius, signal: AbortSignal.abort() });
    expect(nebius.calls).toEqual([]);
    expect(types(events)).toEqual(["started", "aborted", "done"]);
  });
});
