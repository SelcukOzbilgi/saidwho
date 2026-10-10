import { describe, expect, it } from "vitest";

import type { ChatParams, NebiusClient } from "../lib/server/providers/nebius";
import type { TavilyClient } from "../lib/server/providers/tavily";
import { type RunEvent, runEventSchema } from "./events";
import { everyStepOn, MODELS, type ModelPolicy } from "./models";
import { investigate, LIBRARY_SITES } from "./orchestrator";
import type { GenealogistOutput, JudgeOutput, PlannerOutput, ReaderOutput } from "./schemas";

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
  trace?: (call: Call) => Reply<GenealogistOutput>;
  verdict?: (call: Call) => Reply<JudgeOutput>;
  // Milliseconds a reader call takes, by its prompt.
  readDelay?: (user: string) => number;
};

const PLAN: PlannerOutput = {
  variants: [],
  candidate_authors: ["Albert Einstein"],
  queries: ["origin of the insanity quote"],
  usual_attribution: null,
};
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
            : name === "trace"
              ? (replies.trace ?? (() => ({ leads: [] })))(call)
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

// A search fake whose results depend on the query, with page text by URL.
function tavilyFor(urlsFor: (query: string) => readonly string[], textOf: (url: string) => string = () => PAGE_TEXT) {
  const queries: string[] = [];
  const options: unknown[] = [];
  const tavily: TavilyClient = {
    extract: async () => {
      throw new Error("not used");
    },
    search: async (query: string, searchOptions?: unknown) => {
      queries.push(query);
      options.push(searchOptions);
      const results = urlsFor(query).map((url) => ({ url, title: `Page at ${url}`, rawContent: textOf(url) }));
      return { ok: true, latencyMs: 5, data: { results, usage: { credits: 1 } } } as never;
    },
  };
  return { tavily, queries, options };
}

const NEWS = "https://news.example.org/1981";
const BOOK = "https://archive.org/details/sudden-death";
const BOOK_TEXT = `Sudden Death, a novel by Rita Mae Brown. New York: Bantam, 1983. ${SECRET} She said "${QUOTE}." ${SECRET}`;
const CITES_BOOK: ReaderOutput = { ...READ, cited_source: "Rita Mae Brown, Sudden Death (1983)", cited_source_date: "1983" };
const LEAD = {
  from_node: "n1",
  work: "Sudden Death by Rita Mae Brown",
  year: "1983",
  query: "Sudden Death Rita Mae Brown novel",
  wording: null,
};

const INPUT = { quote: QUOTE, popularAttribution: "Albert Einstein", language: "en", excludeDomains: ["quoteinvestigator.com"] };

async function run(
  options: {
    nebius?: NebiusClient;
    tavily?: TavilyClient;
    maxUsd?: number;
    signal?: AbortSignal;
    name?: string | null;
    models?: ModelPolicy;
  } = {},
) {
  const events: RunEvent[] = [];
  await investigate({
    nebius: options.nebius ?? fakeNebius(),
    tavily: options.tavily ?? fakeTavily(),
    input: options.name === undefined ? INPUT : { ...INPUT, popularAttribution: options.name },
    maxUsd: options.maxUsd,
    signal: options.signal,
    models: options.models,
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

  it("asks the planner for the usual credit when no name was given, and judges against it", async () => {
    const nebius = fakeNebius({ plan: () => ({ ...PLAN, usual_attribution: "  Albert\nEinstein " }) });
    const events = await run({ nebius, name: null });
    expect(events[0]).toMatchObject({ type: "started", popularAttribution: null });
    expect(nebius.prompts.get("plan")).toContain("Usually credited to: not given");
    expect(events.find((e) => e.type === "planned")).toMatchObject({ foundAttribution: "Albert Einstein" });
    expect(nebius.prompts.get("verdict")).toContain("Usually credited to: Albert Einstein\n");
    for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
  });

  it("keeps the visitor's name even when the planner offers another", async () => {
    const nebius = fakeNebius({ plan: () => ({ ...PLAN, usual_attribution: "Mark Twain" }) });
    const events = await run({ nebius });
    expect(events.find((e) => e.type === "planned")).toMatchObject({ foundAttribution: null });
    expect(nebius.prompts.get("verdict")).toContain("Usually credited to: Albert Einstein\n");
  });

  it("drops an over-long name from the planner and judges with no name", async () => {
    const nebius = fakeNebius({ plan: () => ({ ...PLAN, usual_attribution: "x".repeat(201) }) });
    const events = await run({ nebius, name: null });
    expect(events.find((e) => e.type === "planned")).toMatchObject({ foundAttribution: null });
    expect(nebius.prompts.get("verdict")).toContain("Usually credited to: no one named\n");
  });

  describe("Genealogist", () => {
    it("follows a confirmed page's citation and reads what turns up", async () => {
      // The lead's search finds the page already read, an excluded site and the book itself.
      const { tavily, queries, options } = tavilyFor(
        (q) => (q === LEAD.query ? [NEWS, "https://quoteinvestigator.com/same", BOOK] : [NEWS]),
        (url) => (url === BOOK ? BOOK_TEXT : PAGE_TEXT),
      );
      let traces = 0;
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(BOOK) ? { ...READ, page_date: "1983" } : CITES_BOOK),
        trace: () => (++traces === 1 ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });

      // The book names no older work, so there is nothing for a second round.
      expect(nebius.calls).toEqual(["plan", "read_page", "trace", "read_page", "verdict"]);
      expect(queries.at(-1)).toBe(LEAD.query);
      // A lead is looked for in digital libraries only; the first searches are open.
      expect(options.at(-1)).toMatchObject({ includeDomains: LIBRARY_SITES, includeDomainsMode: "restrict" });
      expect(options[0]).not.toHaveProperty("includeDomains");
      expect(nebius.prompts.get("trace")).toContain("- n1: Rita Mae Brown, Sudden Death (1983)");
      expect(events.find((e) => e.type === "traced")).toMatchObject({
        round: 1,
        leads: [{ fromNode: "n1", work: LEAD.work, query: LEAD.query }],
      });
      expect(events.find((e) => e.type === "pages_ready" && e.round === 1)).toMatchObject({ pages: 1, droppedExcluded: 1 });
      const added = events.flatMap((e) => (e.type === "node_added" ? [e.node] : []));
      expect(added.map((n) => [n.id, n.url, n.foundVia ?? null])).toEqual([
        ["n1", NEWS, null],
        ["n2", BOOK, { node: "n1", work: LEAD.work }],
      ]);
      // The book's year is kept because the page itself says 1983, not because the lead did.
      expect(added[1].date).toBe("1983");
      const bookRead = nebius.log.find((c) => c.name === "read_page" && c.user.includes(BOOK));
      expect(bookRead?.user).toContain("Lead: this page turned up in a search for Sudden Death by Rita Mae Brown (1983)");
      expect(bookRead?.user).toContain("put the date this page gives for the work in page_date");
      expect(nebius.prompts.get("verdict")).toContain('"looking_for": "Sudden Death by Rita Mae Brown"');
      for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
      expect(JSON.stringify(events)).not.toContain(SECRET);
    });

    it("does not take a year from the lead that the page doesn't give", async () => {
      const { tavily } = tavilyFor((q) => (q === LEAD.query ? [BOOK] : [NEWS]), (url) => (url === BOOK ? `"${QUOTE}"` : PAGE_TEXT));
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(BOOK) ? { ...READ, page_date: "1983" } : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      const book = events.flatMap((e) => (e.type === "node_added" && e.node.url === BOOK ? [e.node] : []))[0];
      expect(book).toMatchObject({ pageDate: null, date: null });
    });

    it("never follows a citation from a crossed-out reading", async () => {
      const nebius = fakeNebius({ read: () => ({ ...CITES_BOOK, exact_snippet: "A sentence this page does not have." }) });
      await run({ nebius });
      expect(nebius.calls).not.toContain("trace");
    });

    it("stops after two rounds even when every page cites something new", async () => {
      let page = 0;
      const { tavily } = tavilyFor((q) => (q.startsWith("work") ? [`https://old.example.org/${++page}`] : [NEWS]));
      let traces = 0;
      const nebius = fakeNebius({
        read: ({ user }) => ({ ...CITES_BOOK, cited_source: `Work cited on ${user.length}` }),
        trace: ({ user }) => {
          traces++;
          const from = /- (n\d+):/.exec(user)?.[1] ?? "n1";
          return { leads: [{ ...LEAD, from_node: from, work: `Work ${traces}`, query: `work ${traces}` }] };
        },
      });
      const events = await run({ nebius, tavily });
      expect(nebius.calls.filter((c) => c === "trace")).toHaveLength(2);
      expect(events.filter((e) => e.type === "traced").map((e) => e.type === "traced" && e.round)).toEqual([1, 2]);
      expect(events.at(-1)?.type).toBe("done");
    });

    it("drops leads that point at nodes it wasn't shown, repeat a work or run too long", async () => {
      const nebius = fakeNebius({
        read: () => CITES_BOOK,
        trace: () => ({
          leads: [
            { ...LEAD, from_node: "n9" },
            { ...LEAD, query: "x".repeat(301) },
            LEAD,
            { ...LEAD, work: " sudden  death BY rita mae brown " },
          ],
        }),
      });
      const events = await run({ nebius });
      expect(events.find((e) => e.type === "traced")).toMatchObject({ leads: [{ fromNode: "n1", work: LEAD.work }] });
    });

    it("goes on to judge when tracing fails", async () => {
      const nebius = fakeNebius({ read: () => CITES_BOOK, trace: () => null });
      const events = await run({ nebius });
      expect(types(events).slice(-3)).toEqual(["trace_failed", "verdict", "done"]);
      expect(nebius.calls.filter((c) => c === "trace")).toHaveLength(1);
    });

    it("starts no trace once the readers use up the budget", async () => {
      const nebius = fakeNebius({ read: () => CITES_BOOK });
      const events = await run({ nebius, maxUsd: 0.0004 });
      expect(nebius.calls).toEqual(["plan", "read_page"]);
      expect(types(events).slice(-2)).toEqual(["budget_exceeded", "done"]);
    });
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

  it("keeps Lightning's crossed-out node when Super's re-read gives none", async () => {
    const tidied = "Einstein said doing the same thing twice is madness itself";
    for (const superReply of [null, { ...READ, contains_quote: false, exact_snippet: null }]) {
      const nebius = fakeNebius({ read: ({ model }) => (model === MODELS.lightning.id ? { ...READ, exact_snippet: tidied } : superReply) });
      const events = await run({ nebius });
      const added = events.flatMap((e) => (e.type === "node_added" ? [e.node] : []));
      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({ id: "n1", check: { status: "not_found" }, reader: { exact_snippet: tidied } });
      expect(types(events).slice(-2)).toEqual(["judge_skipped", "done"]);
    }
  });

  it("reads a page again when an over-long field comes with no quote", async () => {
    const nebius = fakeNebius({
      read: ({ model }) =>
        model === MODELS.lightning.id ? { ...READ, contains_quote: false, exact_snippet: null, page_date: "x".repeat(301) } : READ,
    });
    const events = await run({ nebius });
    expect(events.find((e) => e.type === "page_read")).toMatchObject({ tier: "lightning", outcome: "too_long" });
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
    const added = events.filter((e) => e.type === "node_added");
    expect(added).toHaveLength(1);
    expect(added[0]?.type === "node_added" && added[0].node.check.status).toBe("not_found");
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

  it("finds an unverified id inside a group of citations", async () => {
    const nebius = fakeNebius({
      verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, rationale: "Evidence [n1, n99] and [[n1]] prove this." } : VERDICT),
    });
    const events = await run({ nebius });
    expect(events.find((e) => e.type === "verdict")).toMatchObject({ tier: "super", unknownIds: ["n99"] });
    expect(events.at(-2)).toMatchObject({ type: "verdict", tier: "ultra" });
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

  it("puts every step on the policy's model, retries included", async () => {
    let reads = 0;
    let verdicts = 0;
    const nebius = fakeNebius({
      read: () => (reads++ === 0 ? null : CITES_BOOK),
      verdict: () => (verdicts++ === 0 ? { ...VERDICT, rationale: "See [n9]." } : VERDICT),
    });
    const events = await run({ nebius, models: everyStepOn(MODELS.ultra) });
    expect(nebius.calls).toEqual(["plan", "read_page", "read_page", "trace", "verdict", "verdict"]);
    expect(new Set(nebius.log.map((c) => c.model))).toEqual(new Set([MODELS.ultra.id]));
    const escalations = events.flatMap((e) => (e.type === "escalated" ? [[e.step, e.from, e.to]] : []));
    expect(escalations).toEqual([
      ["read", "ultra", "ultra"],
      ["judge", "ultra", "ultra"],
    ]);
    for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
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
