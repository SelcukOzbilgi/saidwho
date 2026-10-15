import { describe, expect, it } from "vitest";

import type { ChatParams, NebiusClient } from "../lib/server/providers/nebius";
import { worthScoring } from "../eval/score";
import type { TavilyClient } from "../lib/server/providers/tavily";
import { type RunEvent, runEventSchema, standingVerdict } from "./events";
import { MAX_JUDGE_CALLS } from "./judge";
import { everyStepOn, MODELS, type ModelPolicy } from "./models";
import { investigate, LIBRARY_SITES, overlongFields } from "./orchestrator";
import type { GenealogistOutput, JudgeOutput, PlannerOutput, ReaderOutput } from "./schemas";

const QUOTE = "Insanity is doing the same thing over and over again and expecting different results";
// Page text that must never reach an event: events are stored and streamed.
const SECRET = "SENTINEL-PAGE-BODY-7f3a";
const PAGE_TEXT = `Knoxville News-Sentinel, 1981. ${SECRET} At the meeting a speaker said: "${QUOTE}." ${SECRET}`;

// One model call as the fake sees it, so a reply can depend on the model and thinking setting.
type Call = { name: string; model: string; thinking: boolean; user: string; maxTokens: number; schema: Record<string, unknown> };
// null is a failed call (a provider error), "auth" a rejected key, "bad_request"
// a request the provider refuses and "length" a call that ran out of tokens.
type Reply<T> = T | null | "auth" | "bad_request" | "length";

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
  lineage: [{ node: "n1", change: "first", note: "A 1981 newspaper has it, credited to no one." }],
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
      const format = params.response_format as { json_schema: { name: string; schema: Record<string, unknown> } };
      const name = format.json_schema.name;
      const user = String(params.messages.at(-1)?.content ?? "");
      const kwargs = params.chat_template_kwargs as { enable_thinking: boolean };
      const maxTokens = Number(params.max_tokens);
      const call = { name, model: params.model, thinking: kwargs.enable_thinking, user, maxTokens, schema: format.json_schema.schema };
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
      if (reply === null || reply === "auth" || reply === "bad_request") {
        const kind = reply ?? "upstream";
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

// A search fake with results, and the text of each if it has one, by query.
function tavilyByQuery(resultsFor: (query: string) => { url: string; text?: string }[]): TavilyClient {
  return {
    extract: async () => {
      throw new Error("not used");
    },
    search: async (query: string) => {
      const results = resultsFor(query).map(({ url, text }) => ({ url, title: `Page at ${url}`, rawContent: text }));
      return { ok: true, latencyMs: 5, data: { results, usage: { credits: 1 } } } as never;
    },
  };
}

const NEWS = "https://news.example.org/1981";
// A page of the book's text, not its item page (see mayHoldWork).
const BOOK = "https://archive.org/stream/sudden-death/sudden-death_djvu.txt";
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
    plan?: PlannerOutput;
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
    plan: options.plan,
    onEvent: (event) => events.push(event),
  });
  return events;
}

const types = (events: readonly RunEvent[]) => events.map((e) => e.type);

describe("investigate", () => {
  it("trims stray brackets and quotes off the planner's wordings and keeps each once", async () => {
    const variants = ["] Gel, gel[", "“Gel gel”", "gel, gel", "x".repeat(301), "  ", "[Come, come again]"];
    const nebius = fakeNebius({ plan: () => ({ ...PLAN, variants }) });
    const events = await run({ nebius });
    expect(events.find((e) => e.type === "planned")).toMatchObject({ variants: ["Gel, gel", "Come, come again"] });
    expect(nebius.prompts.get("read_page")).toContain("Variants: Gel, gel | Come, come again");
  });

  it("takes markup the planner left in its wordings and queries off them", async () => {
    // From the second eval's 640k plan.
    const plan = {
      ...PLAN,
      variants: ["> 640K ought to be enough for anybody.", ':"640K should be enough for everyone.', "640K wouldn\\'t be enough"],
      queries: ["> earliest newspaper article 640K enough", "> Bill Gates 640K quote origin"],
    };
    const { tavily, queries } = tavilyFor(() => [NEWS]);
    const events = await run({ nebius: fakeNebius({ plan: () => plan }), tavily });
    expect(events.find((e) => e.type === "planned")).toMatchObject({
      variants: ["640K ought to be enough for anybody.", "640K should be enough for everyone.", "640K wouldn't be enough"],
      queries: [`"${QUOTE}"`, "earliest newspaper article 640K enough", "Bill Gates 640K quote origin"],
    });
    expect(queries.slice(1)).toEqual(["earliest newspaper article 640K enough", "Bill Gates 640K quote origin"]);
  });

  it("uses a saved plan instead of asking the planner, and says so", async () => {
    const saved: PlannerOutput = { ...PLAN, queries: ["insanity quote earliest newspaper"], variants: ["Insanity is doing the same thing again"] };
    const { tavily, queries } = tavilyFor(() => [NEWS]);
    const nebius = fakeNebius();
    const events = await run({ nebius, tavily, plan: saved });
    expect(nebius.calls).not.toContain("plan");
    expect(events.find((e) => e.type === "planned")).toMatchObject({
      replayed: true,
      costUsd: 0,
      queries: [`"${QUOTE}"`, "insanity quote earliest newspaper"],
      variants: ["Insanity is doing the same thing again"],
    });
    expect(queries).toEqual([`"${QUOTE}"`, "insanity quote earliest newspaper"]);
    for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
  });

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

  it("keeps each call's token counts, and none for a call that never answered", async () => {
    const events = await run();
    expect(events.find((e) => e.type === "planned")).toMatchObject({ tokens: { promptTokens: 1_000, completionTokens: 100 } });
    const rejected = await run({ nebius: fakeNebius({ plan: () => "auth" }) });
    expect(rejected.find((e) => e.type === "plan_failed")).not.toHaveProperty("tokens");
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
      // The work turned up with the saying, so it isn't listed as one that didn't.
      expect(nebius.prompts.get("verdict")).not.toContain("Cited works");
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

    it("never searches for a lead whose query can't be a search, and lists the query", async () => {
      const { tavily, queries } = tavilyFor(() => [NEWS]);
      const nebius = fakeNebius({ read: () => CITES_BOOK, trace: () => ({ leads: [{ ...LEAD, query: ' ">" ' }] }) });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "traced")).toMatchObject({ leads: [], rejectedQueries: [' ">" '] });
      expect(queries).not.toContain('">"');
      for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
    });

    // The book as a library has it, without the saying.
    // Long enough to be a work's text rather than a catalog record.
    const BOOK_WITHOUT = `Sudden Death, a novel by Rita Mae Brown. New York: Bantam, 1983. ${SECRET} ${"Chapter one. ".repeat(1_000)}${SECRET}`;
    const NO_QUOTE: ReaderOutput = { ...READ, contains_quote: false, exact_snippet: null, page_date: null };
    const citedWorks = (prompt = "") => {
      const at = prompt.indexOf("Cited works:\n");
      return at === -1 ? null : JSON.parse(prompt.slice(at + "Cited works:\n".length));
    };

    it("tells the judge when the pages found for a cited work don't have the saying", async () => {
      const { tavily } = tavilyFor((q) => (q === LEAD.query ? [BOOK] : [NEWS]), (url) => (url === BOOK ? BOOK_WITHOUT : PAGE_TEXT));
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(BOOK) ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(citedWorks(nebius.prompts.get("verdict"))).toEqual([
        {
          cited_by: "n1",
          work: LEAD.work,
          checked: `The pages this run read for ${LEAD.work} on archive.org don't have the saying; they may be another edition or only part of the work.`,
          pages: [{ site: "archive.org", title: `Page at ${BOOK}` }],
        },
      ]);
      expect(events.find((e) => e.type === "cited_works")).toEqual({
        type: "cited_works",
        works: [{ citedBy: "n1", work: LEAD.work, checked: `The pages this run read for ${LEAD.work} on archive.org don't have the saying; they may be another edition or only part of the work.` }],
      });
      expect(types(events).slice(-3)).toEqual(["cited_works", "verdict", "done"]);
      expect(events.find((e) => e.type === "page_read" && e.url === BOOK)).toMatchObject({ outcome: "no_quote", lookingFor: LEAD.work });
      expect(events.find((e) => e.type === "page_read" && e.url === NEWS)).not.toHaveProperty("lookingFor");
      expect(JSON.stringify(events)).not.toContain(SECRET);
    });

    it("says nothing about a cited work whose search returned no text of it", async () => {
      const { tavily } = tavilyFor((q) => (q === LEAD.query ? [] : [NEWS]));
      const nebius = fakeNebius({ read: () => CITES_BOOK, trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }) });
      const events = await run({ nebius, tavily });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
      expect(types(events)).not.toContain("cited_works");
    });

    it("doesn't count a library's help, search or catalog page against a cited work", async () => {
      const help = "https://help.archive.org/books";
      const record = "https://books.google.com/books/about/Sudden_Death.html?id=abc";
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? [help, record, BOOK] : [NEWS]),
        (url) => (url === NEWS ? PAGE_TEXT : url === BOOK ? BOOK_WITHOUT : `Sudden Death, Rita Mae Brown. ${"About this book. ".repeat(80)}`),
      );
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      await run({ nebius, tavily });
      const [entry] = citedWorks(nebius.prompts.get("verdict"));
      expect(entry.pages).toEqual([{ site: "archive.org", title: `Page at ${BOOK}` }]);
    });

    it("says nothing about a cited work when its search found only catalog and item pages", async () => {
      // As for Cameron's book in the second eval: an archive.org item page with no text.
      const record = "https://catalog.hathitrust.org/Record/123";
      const item = "https://archive.org/details/informalsociolog0000came";
      const shell = `Internet Archive Audio Featured Top Images. Bookreader Item Preview. Sudden Death : Rita Mae Brown. ${"Featured Top ".repeat(60)}DOWNLOAD OPTIONS No suitable files to display here.`;
      const { tavily } = tavilyFor((q) => (q === LEAD.query ? [record, item] : [NEWS]), (url) => (url === NEWS ? PAGE_TEXT : url === item ? shell : BOOK_WITHOUT));
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "page_read" && e.url === item)).toMatchObject({ outcome: "no_quote" });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when a confirmed library page is that work", async () => {
      // As in the second eval's let-them-eat-cake: the citing page is a Wikisource
      // page of the Confessions, and the library search found other parts of it.
      const work = "Les Confessions by Jean-Jacques Rousseau";
      const livre = "https://fr.wikisource.org/wiki/Les_Confessions_(Rousseau)/Livre_VI";
      const contents = "https://fr.wikisource.org/wiki/Les_Confessions_(Rousseau)/Livre_I";
      const lead = { ...LEAD, work, query: "Les Confessions Rousseau" };
      const tavily: TavilyClient = {
        extract: async () => {
          throw new Error("not used");
        },
        search: async (query: string) => {
          const results =
            query === lead.query
              ? [{ url: contents, title: "Les Confessions (Rousseau)/Livre I - Wikisource", rawContent: BOOK_WITHOUT }]
              : [{ url: livre, title: "Les Confessions (Rousseau)/Livre VI - Wikisource", rawContent: PAGE_TEXT }];
          return { ok: true, latencyMs: 5, data: { results, usage: { credits: 1 } } } as never;
        },
      };
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : { ...CITES_BOOK, cited_source: "Les Confessions" }),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [lead] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "page_read" && e.url === contents)).toMatchObject({ outcome: "no_quote", lookingFor: work });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("doesn't count a page against the citation when its full text has the saying the reader missed", async () => {
      // The book has the quote far past what the reader is shown.
      const longBook = `Sudden Death. ${"Filler words about tennis. ".repeat(2_000)} She said \"${QUOTE}.\"`;
      const { tavily } = tavilyFor((q) => (q === LEAD.query ? [BOOK] : [NEWS]), (url) => (url === BOOK ? longBook : PAGE_TEXT));
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(BOOK) ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
      expect(types(events)).not.toContain("cited_works");
    });

    it("says nothing about a cited work when one of its pages gave a reading, even a crossed-out one", async () => {
      const OTHER = "https://www.gutenberg.org/ebooks/sudden-death";
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? [BOOK, OTHER] : [NEWS]),
        (url) => (url === BOOK || url === OTHER ? BOOK_WITHOUT : PAGE_TEXT),
      );
      const nebius = fakeNebius({
        // The archive.org copy gets a snippet that isn't on it, from both readers.
        read: ({ user }) =>
          user.includes(BOOK) ? { ...READ, exact_snippet: "A sentence the book does not have at all." } : user.includes(OTHER) ? NO_QUOTE : CITES_BOOK,
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "node_added" && e.node.url === BOOK)).toMatchObject({ node: { check: { status: "not_found" } } });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when another of its pages has the saying, or couldn't be read", async () => {
      const OTHER = "https://www.gutenberg.org/ebooks/sudden-death";
      const leadPages = (q: string) => (q === LEAD.query ? [BOOK, OTHER] : [NEWS]);
      const trace = ({ user }: { user: string }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] });
      // The Gutenberg copy has the quote, and its reader misses it.
      const holds = tavilyFor(leadPages, (url) => (url === BOOK ? BOOK_WITHOUT : url === OTHER ? BOOK_TEXT : PAGE_TEXT));
      const missed = fakeNebius({ read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : CITES_BOOK), trace });
      await run({ nebius: missed, tavily: holds.tavily });
      expect(citedWorks(missed.prompts.get("verdict"))).toBeNull();
      // Neither reader gets an answer for the Gutenberg copy.
      const unread = tavilyFor(leadPages, (url) => (url === NEWS ? PAGE_TEXT : BOOK_WITHOUT));
      const failed = fakeNebius({ read: ({ user }) => (user.includes(OTHER) ? null : user.includes(BOOK) ? NO_QUOTE : CITES_BOOK), trace });
      await run({ nebius: failed, tavily: unread.tavily });
      expect(citedWorks(failed.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when a result the readers skip has the saying", async () => {
      const trace = ({ user }: { user: string }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] });
      const read = ({ user }: { user: string }) => (user.includes("Lead:") ? NO_QUOTE : CITES_BOOK);
      // The library search returns the page read in the first round, which has the quote.
      const again = tavilyFor((q) => (q === LEAD.query ? [NEWS, BOOK] : [NEWS]), (url) => (url === BOOK ? BOOK_WITHOUT : PAGE_TEXT));
      const seen = fakeNebius({ read, trace });
      await run({ nebius: seen, tavily: again.tavily });
      expect(seen.log.filter((c) => c.name === "read_page" && c.user.includes("Lead:"))).toHaveLength(1);
      expect(citedWorks(seen.prompts.get("verdict"))).toBeNull();
      // Only the first three results are read, and the fourth has the quote.
      const copies = [1, 2, 3, 4].map((n) => `https://archive.org/details/sudden-death-${n}`);
      const many = tavilyFor((q) => (q === LEAD.query ? copies : [NEWS]), (url) => (url === copies[3] ? BOOK_TEXT : url === NEWS ? PAGE_TEXT : BOOK_WITHOUT));
      const capped = fakeNebius({ read, trace });
      await run({ nebius: capped, tavily: many.tavily });
      expect(capped.log.filter((c) => c.name === "read_page" && c.user.includes("Lead:"))).toHaveLength(3);
      expect(citedWorks(capped.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when its search returns a page read before that gave a reading", async () => {
      // The newspaper has a wording the run doesn't know, and the Checker confirms it.
      const VARIANT = "Insanity is doing the same thing again and again and expecting a different result";
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? [NEWS, BOOK] : [NEWS]),
        (url) => (url === BOOK ? BOOK_WITHOUT : `Knoxville News-Sentinel, 1981. She said "${VARIANT}."`),
      );
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : { ...CITES_BOOK, exact_snippet: VARIANT }),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "node_added" && e.node.url === NEWS)).toMatchObject({ node: { check: { status: "exact" } } });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when another lead reads one of its results and gets a reading", async () => {
      // Two pages cite two works, and both library searches return the same fourth page.
      const SECOND = "https://news.example.org/1990";
      const OTHER_LEAD = { ...LEAD, from_node: "n2", work: "Collected Letters by Rita Mae Brown", query: "rita mae brown letters" };
      const VARIANT = "Insanity is doing the same thing again and again and expecting a different result";
      const copies = [1, 2, 3].map((n) => `https://archive.org/details/sudden-death-${n}`);
      const shared = "https://www.gutenberg.org/ebooks/shared";
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? [...copies, shared] : q === OTHER_LEAD.query ? [shared] : [NEWS, SECOND]),
        (url) => (url === shared ? `A book. She said "${VARIANT}."` : url === NEWS || url === SECOND ? PAGE_TEXT : BOOK_WITHOUT),
      );
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(shared) ? { ...READ, exact_snippet: VARIANT } : user.includes("Lead:") ? NO_QUOTE : CITES_BOOK),
        // Both newspapers cite the same book, so they share a line.
        trace: ({ user }) => (user.includes("- n1, n2:") ? { leads: [LEAD, OTHER_LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "node_added" && e.node.url === shared)).toMatchObject({ node: { check: { status: "exact" } } });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when an earlier search got more of one of its pages, with the saying", async () => {
      const OTHER = "https://www.gutenberg.org/ebooks/sudden-death";
      // The first search gets the whole book, which has the quote; the library
      // search gets only its first part. Both readers of the book miss the quote.
      const tavily = tavilyByQuery((q) =>
        q === LEAD.query
          ? [
              { url: BOOK, text: "Sudden Death, a novel by Rita Mae Brown. Chapter one." },
              { url: OTHER, text: BOOK_WITHOUT },
            ]
          : [
              { url: NEWS, text: PAGE_TEXT },
              { url: BOOK, text: BOOK_TEXT },
            ],
      );
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(NEWS) ? CITES_BOOK : NO_QUOTE),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "page_read" && e.url === OTHER)).toMatchObject({ outcome: "no_quote" });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work when a result nobody read has a wording another page confirmed", async () => {
      const SECOND = "https://news.example.org/1990";
      const OTHER_LEAD = { ...LEAD, from_node: "n2", work: "Collected Letters by Rita Mae Brown", query: "rita mae brown letters" };
      const VARIANT = "Insanity is doing the same thing again and again and expecting a different result";
      const copies = [1, 2, 3, 4].map((n) => `https://archive.org/details/sudden-death-${n}`);
      const elsewhere = "https://www.gutenberg.org/ebooks/elsewhere";
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? copies : q === OTHER_LEAD.query ? [elsewhere] : [NEWS, SECOND]),
        // The fourth copy has the variant, and the readers only get the first three.
        (url) => (url === copies[3] || url === elsewhere ? `A book. She said "${VARIANT}."` : url === NEWS || url === SECOND ? PAGE_TEXT : BOOK_WITHOUT),
      );
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(elsewhere) ? { ...READ, exact_snippet: VARIANT } : user.includes("Lead:") ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1, n2:") ? { leads: [LEAD, OTHER_LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.some((e) => e.type === "page_read" && e.url === copies[3])).toBe(false);
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("keeps every text the first searches got for a page, not just the first", async () => {
      const OTHER = "https://www.gutenberg.org/ebooks/sudden-death";
      // The exact-quote search gets part of the book, the planner's search all of it.
      const tavily = tavilyByQuery((q) =>
        q === LEAD.query
          ? [{ url: BOOK, text: BOOK_WITHOUT }, { url: OTHER, text: BOOK_WITHOUT }]
          : q.startsWith('"')
            ? [{ url: NEWS, text: PAGE_TEXT }, { url: BOOK, text: BOOK_WITHOUT }]
            : [{ url: BOOK, text: BOOK_TEXT }],
      );
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(NEWS) ? CITES_BOOK : NO_QUOTE),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      await run({ nebius, tavily });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("says nothing about a cited work whose search returned no text when the run read one of its pages with the saying", async () => {
      const tavily = tavilyByQuery((q) => (q === LEAD.query ? [{ url: BOOK }] : [{ url: NEWS, text: PAGE_TEXT }, { url: BOOK, text: BOOK_TEXT }]));
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(NEWS) ? CITES_BOOK : READ),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "node_added" && e.node.url === BOOK)).toMatchObject({ node: { check: { status: "exact" } } });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("checks the wording a lead gives even when that lead's search fails", async () => {
      const SECOND = "https://news.example.org/1990";
      const VARIANT = "Insanity is doing the same thing again and again and expecting a different result";
      const OTHER_LEAD = { ...LEAD, from_node: "n2", work: "Collected Letters by Rita Mae Brown", query: "rita mae brown letters", wording: VARIANT };
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? [BOOK] : [NEWS, SECOND]),
        (url) => (url === BOOK ? `Sudden Death. She said "${VARIANT}."` : PAGE_TEXT),
      );
      const failing: TavilyClient = {
        ...tavily,
        search: async (query, options) =>
          query === OTHER_LEAD.query ? ({ ok: false, error: { provider: "tavily", kind: "upstream", message: "boom" }, latencyMs: 5 } as never) : tavily.search(query, options),
      };
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1, n2:") ? { leads: [LEAD, OTHER_LEAD] } : { leads: [] }),
      });
      await run({ nebius, tavily: failing });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("doesn't let a short confirmed snippet keep a cited work off the list", async () => {
      const SECOND = "https://news.example.org/1990";
      // A reader quotes only part of the saying, and the book has those words in another sentence.
      const { tavily } = tavilyFor(
        (q) => (q === LEAD.query ? [BOOK] : [NEWS, SECOND]),
        (url) => (url === BOOK ? `${BOOK_WITHOUT} They did the same thing over and over every day.` : PAGE_TEXT),
      );
      const nebius = fakeNebius({
        read: ({ user }) =>
          user.includes("Lead:") ? NO_QUOTE : user.includes(SECOND) ? { ...READ, exact_snippet: "the same thing over and over" } : CITES_BOOK,
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
      });
      const events = await run({ nebius, tavily });
      expect(events.find((e) => e.type === "node_added" && e.node.url === SECOND)).toMatchObject({ node: { check: { status: "exact" } } });
      expect(citedWorks(nebius.prompts.get("verdict"))).toHaveLength(1);
    });

    it("lists a cited work's pages in search order, however the readers finish", async () => {
      const OTHER = "https://www.gutenberg.org/ebooks/sudden-death";
      const { tavily } = tavilyFor((q) => (q === LEAD.query ? [BOOK, OTHER] : [NEWS]), (url) => (url === NEWS ? PAGE_TEXT : BOOK_WITHOUT));
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes("Lead:") ? NO_QUOTE : CITES_BOOK),
        trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }),
        // The archive.org reader finishes last.
        readDelay: (user) => (user.includes(BOOK) ? 30 : 0),
      });
      await run({ nebius, tavily });
      const [entry] = citedWorks(nebius.prompts.get("verdict"));
      expect(entry.pages.map((p: { site: string }) => p.site)).toEqual(["archive.org", "gutenberg.org"]);
      expect(entry.checked).toContain("on archive.org and gutenberg.org");
    });

    it("says nothing about a cited work when its search fails", async () => {
      const { tavily } = tavilyFor(() => [NEWS]);
      const failing: TavilyClient = {
        ...tavily,
        search: async (query, options) =>
          query === LEAD.query ? ({ ok: false, error: { provider: "tavily", kind: "upstream", message: "boom" }, latencyMs: 5 } as never) : tavily.search(query, options),
      };
      const nebius = fakeNebius({ read: () => CITES_BOOK, trace: ({ user }) => (user.includes("- n1:") ? { leads: [LEAD] } : { leads: [] }) });
      await run({ nebius, tavily: failing });
      expect(citedWorks(nebius.prompts.get("verdict"))).toBeNull();
    });

    it("goes on to judge when tracing fails", async () => {
      const nebius = fakeNebius({ read: () => CITES_BOOK, trace: () => null });
      const events = await run({ nebius });
      expect(types(events).slice(-3)).toEqual(["trace_failed", "verdict", "done"]);
      expect(nebius.calls.filter((c) => c === "trace")).toHaveLength(1);
    });

    it("starts no trace once the readers use up the budget", async () => {
      const nebius = fakeNebius({ read: () => CITES_BOOK });
      const events = await run({ nebius, maxUsd: 0.00135 });
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
    const events = await run({ nebius, maxUsd: 0.00135 });
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
    expect(events[2]).toMatchObject({ step: "plan", from: "ultra", to: "ultra", thinking: false, reason: "ran out of tokens" });
    expect(nebius.log.filter((c) => c.name === "plan").map((c) => c.thinking)).toEqual([true, false]);
    expect(events.at(-2)?.type).toBe("verdict");
  });

  // The second eval's degenerate plans, as Super returned them before the plan moved to Ultra: insanity-same-thing's
  // with nothing in it, and well-behaved-women's with two backslashes for queries.
  const EMPTY_PLAN: PlannerOutput = { variants: [], candidate_authors: [], queries: [], usual_attribution: null };
  const BACKSLASH_PLAN: PlannerOutput = { variants: [], candidate_authors: ["Laurel Thatcher Ulrich"], queries: ["\\", "\\"], usual_attribution: null };

  it("plans again with thinking off when a plan gives no search besides the exact quote, and uses both", async () => {
    for (const degenerate of [EMPTY_PLAN, BACKSLASH_PLAN]) {
      const { tavily, queries } = tavilyFor(() => [NEWS]);
      const nebius = fakeNebius({ plan: ({ thinking }) => (thinking ? degenerate : { ...PLAN, variants: ["Insanity is doing the same thing again"] }) });
      const events = await run({ nebius, tavily });
      expect(types(events).slice(0, 5)).toEqual(["started", "planned", "escalated", "planned", "searched"]);
      expect(events[2]).toMatchObject({ step: "plan", from: "ultra", to: "ultra", thinking: false, reason: "the plan gave no search besides the exact quote" });
      expect(nebius.log.filter((c) => c.name === "plan").map((c) => c.thinking)).toEqual([true, false]);
      expect(events[3]).toMatchObject({
        variants: ["Insanity is doing the same thing again"],
        candidateAuthors: [...new Set([...degenerate.candidate_authors, ...PLAN.candidate_authors])],
        queries: [`"${QUOTE}"`, PLAN.queries[0]],
      });
      expect(queries).toEqual([`"${QUOTE}"`, PLAN.queries[0]]);
      for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("goes on with the first plan when planning again fails", async () => {
    // Running out of tokens is the model's doing, so the eval scores the run; an
    // outage left unmade-up-for is the provider's, so it doesn't.
    for (const [reply, scored] of [["length", true], [null, false]] as const) {
      const events = await run({ nebius: fakeNebius({ plan: ({ thinking }) => (thinking ? EMPTY_PLAN : reply) }) });
      expect(types(events).slice(0, 5)).toEqual(["started", "planned", "escalated", "plan_failed", "searched"]);
      expect(events.at(-2)?.type).toBe("verdict");
      expect(worthScoring(events)).toBe(scored);
    }
  });

  it("plans a third time for no one: a plan given with thinking off stands, and a spent budget stops the second", async () => {
    const retried = fakeNebius({ plan: ({ thinking }) => (thinking ? "length" : EMPTY_PLAN) });
    await run({ nebius: retried });
    expect(retried.calls.filter((c) => c === "plan")).toHaveLength(2);
    const broke = fakeNebius({ plan: () => EMPTY_PLAN });
    const events = await run({ nebius: broke, maxUsd: 0.0001 });
    expect(broke.calls).toEqual(["plan"]);
    expect(types(events)).toEqual(["started", "planned", "budget_exceeded", "done"]);
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
    const events = await run({ nebius, maxUsd: 0.00136 });
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

  describe("a verdict that dates its earliest page by the page's own date", () => {
    // A 2013 page that names the 1981 newspaper, as n9 named P.S. I Love You (1991)
    // when the second eval's judge dated twenty-years-from-now by n9's 2017.
    const page = `Posted 2013. From the Knoxville News-Sentinel, 1981: "${QUOTE}."`;
    const reading = { ...READ, page_date: "2013", cited_source: "Knoxville News-Sentinel", cited_source_date: "1981" };
    const late: JudgeOutput = { ...VERDICT, earliest_date: "2013", rationale: "A 2013 page has it [n1].", lineage: [] };
    const tavily = () => tavilyFor(() => [NEWS], () => page).tavily;

    it("asks Ultra once, told about the cited date, and takes Ultra's verdict", async () => {
      const nebius = fakeNebius({ read: () => reading, verdict: ({ model }) => (model === MODELS.super.id ? late : VERDICT) });
      const events = await run({ nebius, tavily: tavily() });
      expect(types(events).slice(-4)).toEqual(["verdict", "escalated", "verdict", "done"]);
      expect(events.at(-3)).toMatchObject({
        step: "judge",
        from: "super",
        to: "ultra",
        reason: "the verdict dates n1 by the page's own date 2013, though n1 names a source dated 1981",
      });
      expect(nebius.log.filter((c) => c.name === "verdict").at(-1)?.user).toContain("n1 names a source dated 1981");
      expect(standingVerdict(events)).toMatchObject({ tier: "ultra", verdict: { earliest_date: "1981" } });
    });

    it("keeps the first verdict as the Judge gave it when Ultra gives none", async () => {
      const nebius = fakeNebius({ read: () => reading, verdict: ({ model }) => (model === MODELS.super.id ? late : null) });
      const events = await run({ nebius, tavily: tavily() });
      expect(types(events).slice(-4)).toEqual(["verdict", "escalated", "judge_failed", "done"]);
      // Code never takes the cited date for the Judge.
      expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { earliest_date: "2013" } });
      expect(standingVerdict(events)?.fixes).toBeUndefined();
    });

    it("keeps the first verdict when Ultra gives the page's date again, whatever label it gives", async () => {
      // As in the fish-climb-tree replay: Ultra turned a right no_known_source into
      // misattributed while dating the same page by its own date.
      const first = { ...late, verdict: "no_known_source" as const };
      const second = { ...late, verdict: "misattributed" as const, rationale: "A 2013 page has it [n1]; the 1981 newspaper it names is unverified." };
      const nebius = fakeNebius({ read: () => reading, verdict: ({ model }) => (model === MODELS.super.id ? first : second) });
      const events = await run({ nebius, tavily: tavily() });
      expect(nebius.calls.filter((c) => c === "verdict")).toHaveLength(2);
      expect(events.filter((e) => e.type === "verdict").at(-1)).toMatchObject({
        tier: "ultra",
        notTaken: "it gives no supported date earlier than the 2013 it was asked about, on n1, which cites 1981",
      });
      expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { verdict: "no_known_source", earliest_date: "2013" } });
      for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
    });

    it("takes Ultra's verdict when it dates the saying by another, older page, even one citing an older source", async () => {
      // The first verdict dates n1 by its 2013 though n1 cites 1981; Ultra names n2,
      // a 1979 page that itself cites a 1950 source.
      const page = `Posted 2013. From the Knoxville News-Sentinel, 1981: "${QUOTE}."`;
      const other = "https://news.example.org/1979";
      const twoPages = tavilyFor(() => [NEWS, other], (url) => (url === other ? `Posted 1979. From the Basic Text, 1950: "${QUOTE}."` : page)).tavily;
      const elsewhere = { ...late, earliest_node: "n2", earliest_date: "1979", rationale: "A 1979 page has it [n2]." };
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(other) ? { ...READ, page_date: "1979", cited_source: "the Basic Text", cited_source_date: "1950" } : reading),
        verdict: ({ model }) => (model === MODELS.super.id ? late : elsewhere),
      });
      const events = await run({ nebius, tavily: twoPages });
      expect(events.filter((e) => e.type === "verdict").at(-1)).not.toHaveProperty("notTaken");
      expect(standingVerdict(events)).toMatchObject({ tier: "ultra", verdict: { earliest_node: "n2", earliest_date: "1979" } });
    });

    it("keeps the first verdict when Ultra gives no date, or one no page backs", async () => {
      // As Codex put it: a no_known_source on n1's 2013, and a misattributed with no date.
      const first = { ...late, verdict: "no_known_source" as const };
      for (const date of [null, "1975"]) {
        const second = { ...late, verdict: "misattributed" as const, earliest_date: date, rationale: "The 1981 newspaper n1 names is the origin [n1]." };
        const nebius = fakeNebius({ read: () => reading, verdict: ({ model }) => (model === MODELS.super.id ? first : second) });
        const events = await run({ nebius, tavily: tavily() });
        expect(events.filter((e) => e.type === "verdict").at(-1)).toMatchObject({ tier: "ultra", verdict: { earliest_date: null }, notTaken: expect.any(String) });
        expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { verdict: "no_known_source", earliest_date: "2013" } });
      }
    });

    it("keeps the first verdict when Ultra gives the same date from another page", async () => {
      const page = `Posted 2013. From the Knoxville News-Sentinel, 1981: "${QUOTE}."`;
      const other = "https://news.example.org/2013";
      const twoPages = tavilyFor(() => [NEWS, other], (url) => (url === other ? `Posted 2013. "${QUOTE}."` : page)).tavily;
      const sameDate = { ...late, earliest_node: "n2", earliest_date: "2013", rationale: "A 2013 page has it [n2]." };
      const nebius = fakeNebius({
        read: ({ user }) => (user.includes(other) ? { ...READ, page_date: "2013" } : reading),
        verdict: ({ model }) => (model === MODELS.super.id ? late : sameDate),
      });
      const events = await run({ nebius, tavily: twoPages });
      expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { earliest_node: "n1" } });
    });

    it("never makes more than four judge calls", async () => {
      // The longest path: Super refuses the bounded schema, its plain verdict
      // takes the page's date, and Ultra runs out of tokens thinking, then with
      // thinking off. Super's verdict stays the answer, as the Judge gave it.
      const nebius = fakeNebius({
        read: () => reading,
        verdict: ({ model, schema }) => (model === MODELS.super.id ? (JSON.stringify(schema).includes("maxLength") ? "bad_request" : late) : "length"),
      });
      const events = await run({ nebius, tavily: tavily() });
      const calls = nebius.log.filter((c) => c.name === "verdict").map((c) => `${c.model === MODELS.super.id ? "super" : "ultra"}${c.thinking ? "" : " no thinking"}`);
      expect(calls).toEqual(["super", "super", "ultra", "ultra no thinking"]);
      expect(calls).toHaveLength(MAX_JUDGE_CALLS);
      expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { earliest_date: "2013" } });
    });
  });

  describe("a misattributed verdict on an earliest page worded unlike the saying", () => {
    // As Bacon's "Nothing is terrible except fear itself" (1605) was taken for
    // Roosevelt's line in the third eval: an older page with a related idea, a
    // later one with the saying.
    const OLD = "https://sermons.example.org/1950";
    // The Checker keeps it, since it shares the saying's words, but not their order.
    const RELATED = "Expecting results that are different, while doing again the same old thing over, is insanity";
    const pages = (oldText = `A 1950 sermon. "${RELATED}," the preacher said.`) =>
      tavilyFor(() => [OLD, NEWS], (url) => (url === OLD ? oldText : PAGE_TEXT)).tavily;
    const reads = (oldReading: Partial<ReaderOutput> = {}) => ({ user }: Call) =>
      user.includes(OLD) ? { ...READ, exact_snippet: RELATED, attributed_to: "a preacher", page_date: "1950", ...oldReading } : READ;
    const onOld: JudgeOutput = { ...VERDICT, earliest_node: "n1", earliest_date: "1950", rationale: "A 1950 sermon has it [n1].", lineage: [] };
    const onNews: JudgeOutput = { ...VERDICT, earliest_node: "n2", earliest_date: "1981", rationale: "The 1981 newspaper has it [n2].", lineage: [] };

    it("asks Ultra once, shown the page's snippet, and takes a verdict on another page", async () => {
      const nebius = fakeNebius({ read: reads(), verdict: ({ model }) => (model === MODELS.super.id ? onOld : onNews) });
      const events = await run({ nebius, tavily: pages() });
      expect(types(events).slice(-4)).toEqual(["verdict", "escalated", "verdict", "done"]);
      expect(events.at(-3)).toMatchObject({ step: "judge", from: "super", to: "ultra", reason: expect.stringContaining("rests on n1 as another origin") });
      expect(nebius.log.filter((c) => c.name === "verdict").at(-1)?.user).toContain(`its snippet words it very differently: "${RELATED}"`);
      expect(standingVerdict(events)).toMatchObject({ tier: "ultra", verdict: { earliest_node: "n2", earliest_date: "1981" } });
    });

    it("takes Ultra's verdict when it keeps the page but drops the other origin", async () => {
      const unsupported = { ...onOld, verdict: "no_known_source" as const };
      const nebius = fakeNebius({ read: reads(), verdict: ({ model }) => (model === MODELS.super.id ? onOld : unsupported) });
      const events = await run({ nebius, tavily: pages() });
      expect(standingVerdict(events)).toMatchObject({ tier: "ultra", verdict: { verdict: "no_known_source", earliest_node: "n1" } });
    });

    it("keeps the first verdict when Ultra rests on the same page as another origin again", async () => {
      const nebius = fakeNebius({ read: reads(), verdict: () => onOld });
      const events = await run({ nebius, tavily: pages() });
      expect(events.filter((e) => e.type === "verdict").at(-1)).toMatchObject({
        tier: "ultra",
        notTaken: "it rests on n1 as another origin again, the page it was asked about",
      });
      expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { earliest_node: "n1" } });
      for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
    });

    it("keeps the first verdict when Ultra names no page but still says misattributed", async () => {
      const noPage = { ...onOld, earliest_node: null, earliest_date: null, rationale: "Another origin, though no page shows it [n1]." };
      const nebius = fakeNebius({ read: reads(), verdict: ({ model }) => (model === MODELS.super.id ? onOld : noPage) });
      const events = await run({ nebius, tavily: pages() });
      expect(events.filter((e) => e.type === "verdict").at(-1)).toMatchObject({ tier: "ultra", notTaken: expect.stringContaining("rests on n1") });
      expect(standingVerdict(events)).toMatchObject({ tier: "super", verdict: { earliest_node: "n1" } });
    });

    it("doesn't ask when the page credits the usual name, or the verdict isn't misattributed", async () => {
      // The Checker keeps a credit only when the page names that person.
      const byEinstein = `A 1950 talk by Albert Einstein. "${RELATED}," he said.`;
      for (const [text, reading, verdict] of [
        [byEinstein, { attributed_to: "Albert Einstein" }, onOld],
        [undefined, {}, { ...onOld, verdict: "no_known_source" as const }],
      ] as const) {
        const nebius = fakeNebius({ read: reads(reading), verdict: () => verdict });
        const events = await run({ nebius, tavily: pages(text) });
        expect(nebius.calls.filter((c) => c === "verdict")).toHaveLength(1);
        expect(standingVerdict(events)).toMatchObject({ tier: "super" });
      }
    });

    describe("when the page also dates itself over a source it cites", () => {
      const cites = reads({ page_date: "2013", cited_source: "a 1950 sermon", cited_source_date: "1950" });
      const late = { ...onOld, earliest_date: "2013" };
      const both = (second: JudgeOutput) => {
        const nebius = fakeNebius({ read: cites, verdict: ({ model }) => (model === MODELS.super.id ? late : second) });
        return { nebius, events: run({ nebius, tavily: pages(`Posted 2013. From a 1950 sermon: "${RELATED}."`) }) };
      };

      it("asks about both in one second judge", async () => {
        const { nebius, events } = both(onNews);
        await events;
        expect(nebius.calls.filter((c) => c === "verdict")).toHaveLength(2);
        const asked = nebius.log.filter((c) => c.name === "verdict").at(-1)?.user;
        expect(asked).toContain("n1 names a source dated 1950");
        expect(asked).toContain("its snippet words it very differently");
      });

      it("takes a verdict that answers only the origin, on a page with the saying and no earlier date", async () => {
        const { events } = both({ ...onNews, earliest_date: null });
        expect(standingVerdict(await events)).toMatchObject({ tier: "ultra", verdict: { earliest_node: "n2", earliest_date: null } });
      });

      it("takes a verdict that answers only the date, on the same page", async () => {
        const { events } = both({ ...onOld, earliest_date: "1950" });
        expect(standingVerdict(await events)).toMatchObject({ tier: "ultra", verdict: { earliest_node: "n1", earliest_date: "1950" } });
      });

      it("keeps the first verdict when the second answers neither", async () => {
        const { events } = both(late);
        const done = await events;
        expect(done.filter((e) => e.type === "verdict").at(-1)).toMatchObject({
          notTaken:
            "it gives no supported date earlier than the 2013 it was asked about, on n1, which cites 1950, " +
            "and it rests on n1 as another origin again, the page it was asked about",
        });
        expect(standingVerdict(done)).toMatchObject({ tier: "super", verdict: { earliest_date: "2013" } });
      });
    });
  });

  it("asks Ultra when a lineage step is on a node that isn't verified", async () => {
    const stray = { ...VERDICT, lineage: [...(VERDICT.lineage ?? []), { node: "n7", change: "credit" as const, note: "Einstein from here." }] };
    const nebius = fakeNebius({ verdict: ({ model }) => (model === MODELS.super.id ? stray : VERDICT) });
    const events = await run({ nebius });
    const verdicts = events.flatMap((e) => (e.type === "verdict" ? [[e.tier, e.unknownIds]] : []));
    expect(verdicts).toEqual([
      ["super", ["n7"]],
      ["ultra", []],
    ]);
    // The step on n7 is left out of Super's verdict as stored.
    const first = events.find((e) => e.type === "verdict");
    expect(first?.type === "verdict" && first.verdict.lineage?.map((s) => s.node)).toEqual(["n1"]);
  });

  it("drops a lineage step whose note is broken or too long", async () => {
    const lineage = [
      { node: "n1", change: "first" as const, note: "A 1981 newspaper has it." },
      { node: "n1", change: "wording" as const, note: 'Worded as “the same thing.”}, {"node": "n1' },
      { node: "n1", change: "credit" as const, note: "x".repeat(301) },
    ];
    const nebius = fakeNebius({ verdict: () => ({ ...VERDICT, lineage }) });
    const events = await run({ nebius });
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict?.type === "verdict" && verdict.verdict.lineage).toEqual([lineage[0]]);
  });

  it("checks the ids a lineage note cites, too", async () => {
    const lineage = [...(VERDICT.lineage ?? []), { node: "n1", change: "credit" as const, note: "Credited to Einstein after [n99]." }];
    const nebius = fakeNebius({ verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, lineage } : VERDICT) });
    const events = await run({ nebius });
    const first = events.find((e) => e.type === "verdict");
    expect(first).toMatchObject({ tier: "super", unknownIds: ["n99"] });
    expect(first?.type === "verdict" && first.verdict.lineage?.map((s) => s.note)).toEqual([VERDICT.lineage?.[0].note]);
    expect(events.at(-2)).toMatchObject({ type: "verdict", tier: "ultra" });
  });

  it("keeps the first lineage step and the last five when there are more than six", async () => {
    const lineage = Array.from({ length: 8 }, (_, i) => ({ node: "n1", change: "wording" as const, note: `Step ${i + 1}.` }));
    const nebius = fakeNebius({ verdict: () => ({ ...VERDICT, lineage }) });
    const events = await run({ nebius });
    const verdict = events.find((e) => e.type === "verdict");
    const notes = verdict?.type === "verdict" ? verdict.verdict.lineage?.map((s) => s.note) : [];
    expect(notes).toEqual(["Step 1.", "Step 4.", "Step 5.", "Step 6.", "Step 7.", "Step 8."]);
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
    expect(nebius.log.filter((c) => c.name === "verdict").map((c) => c.model)).not.toContain(MODELS.ultra.id);
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

  it("gives no verdict when Super's cites an unconfirmed page and Ultra fails", async () => {
    const nebius = fakeNebius({
      verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, rationale: "See [n9]." } : null),
    });
    const events = await run({ nebius });
    expect(types(events).slice(-4)).toEqual(["verdict", "escalated", "judge_failed", "done"]);
    expect(events.at(-2)).toMatchObject({ tier: "ultra" });
    expect(standingVerdict(events)).toBeNull();
  });

  it("tidies ids the judge wraps in brackets or writes as the string null, and lets the verdict stand", async () => {
    const nebius = fakeNebius({ verdict: () => ({ ...VERDICT, earliest_node: "[n1]", misattribution_node: "null" }) });
    const events = await run({ nebius });
    expect(nebius.calls.filter((c) => c === "verdict")).toHaveLength(1);
    expect(standingVerdict(events)?.verdict).toMatchObject({ earliest_node: "n1", misattribution_node: null });
  });

  it("tells the second judge what was wrong and which ids it may use", async () => {
    const nebius = fakeNebius({
      verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, earliest_node: "n1–n3, n7" } : VERDICT),
    });
    const events = await run({ nebius, tavily: fakeTavily(["https://a.example.org/1", "https://b.example.org/2"]) });
    expect(events.find((e) => e.type === "verdict")).toMatchObject({ tier: "super", unknownIds: ["n1–n3, n7"] });
    const [first, second] = nebius.log.filter((c) => c.name === "verdict");
    expect(first.user).not.toContain("set aside");
    expect(second.user).toContain('"n1–n3, n7" is not a single page id');
    expect(second.user).toContain("Cite only these page ids, written exactly like this: n1, n2.");
    expect(standingVerdict(events)?.tier).toBe("ultra");
  });

  it("gives Super, Lightning and Ultra their own judge budgets", async () => {
    const budgets = async (models?: ModelPolicy) => {
      const nebius = fakeNebius({ verdict: ({ model }) => (model === MODELS.super.id ? { ...VERDICT, rationale: "See [n9]." } : VERDICT) });
      await run({ nebius, models });
      return nebius.log.filter((c) => c.name === "verdict").map((c) => c.maxTokens);
    };
    expect(await budgets()).toEqual([MODELS.super.judgeMaxTokens, MODELS.ultra.judgeMaxTokens]);
    expect(await budgets(everyStepOn(MODELS.lightning))).toEqual([MODELS.lightning.judgeMaxTokens]);
    expect(MODELS.ultra.judgeMaxTokens).toBeGreaterThan(MODELS.super.judgeMaxTokens);
    expect(MODELS.lightning.judgeMaxTokens).toBeGreaterThan(MODELS.super.judgeMaxTokens);
  });

  it("asks for a verdict without the lineage when one with thinking off runs out of tokens too", async () => {
    const nebius = fakeNebius({
      verdict: ({ schema }) => {
        const fields = (schema.properties ?? {}) as Record<string, unknown>;
        if ("lineage" in fields) return "length";
        const { lineage, ...compact } = VERDICT;
        void lineage;
        return compact as JudgeOutput;
      },
    });
    const events = await run({ nebius });
    expect(types(events).slice(-6)).toEqual(["judge_failed", "escalated", "judge_failed", "escalated", "verdict", "done"]);
    expect(events.at(-3)).toMatchObject({ from: "super", to: "super", thinking: false, compact: true });
    const calls = nebius.log.filter((c) => c.name === "verdict");
    expect(calls.map((c) => c.thinking)).toEqual([true, false, false]);
    expect(calls[2].user).toContain("leave out the lineage");
    expect(standingVerdict(events)?.verdict.lineage).toEqual([]);
  });

  it("stops after the verdict without the lineage runs out of tokens", async () => {
    const nebius = fakeNebius({ verdict: () => "length" });
    const events = await run({ nebius });
    expect(nebius.calls.filter((c) => c === "verdict")).toHaveLength(3);
    expect(standingVerdict(events)).toBeNull();
  });

  it("asks the provider for one id per id field and bounded text, and drops the limits if it refuses them", async () => {
    const nebius = fakeNebius({ verdict: ({ schema }) => (JSON.stringify(schema).includes("maxLength") ? "bad_request" : VERDICT) });
    const events = await run({ nebius });
    const [bounded, plain] = nebius.log.filter((c) => c.name === "verdict").map((c) => c.schema);
    expect(bounded).toMatchObject({
      properties: {
        earliest_node: { anyOf: [{ type: "string", pattern: "^n[0-9]+$" }, { type: "null" }] },
        lineage: { maxItems: 6 },
      },
    });
    expect(JSON.stringify(plain)).not.toMatch(/maxLength|maxItems|pattern/);
    expect(standingVerdict(events)?.tier).toBe("super");
    // The eval still scores the run: the refusal was the limits, not the request.
    expect(worthScoring(events)).toBe(true);
  });

  it("names the confirmed page that gives the earliest date when the judge names one that doesn't", async () => {
    const urls = ["https://a.example.org/1", "https://b.example.org/2"];
    const nebius = fakeNebius({
      read: ({ user }) => (user.includes(urls[0]) ? { ...READ, page_date: "1981" } : { ...READ, page_date: null }),
      verdict: () => ({ ...VERDICT, earliest_node: "n2", earliest_date: "1981" }),
    });
    const events = await run({ nebius, tavily: fakeTavily(urls) });
    const verdict = standingVerdict(events);
    expect(verdict?.verdict).toMatchObject({ earliest_node: "n1", earliest_date: "1981" });
    expect(verdict?.fixes).toEqual(["named n1 as the earliest page instead of n2: n1 gives 1981 and n2 doesn't"]);
  });

  it("does not ask Ultra once the budget is spent", async () => {
    const nebius = fakeNebius({ verdict: () => ({ ...VERDICT, rationale: "See [n9]." }) });
    // Plan, one read and the first verdict fit; nothing after them does.
    const events = await run({ nebius, maxUsd: 0.0017 });
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

  describe("search queries", () => {
    it("never sends a planner query that can't be a search, and lists it", async () => {
      const { tavily, queries } = tavilyFor(() => [NEWS]);
      const nebius = fakeNebius({ plan: () => ({ ...PLAN, queries: ['">"', "  origin of\n the insanity quote "] }) });
      const events = await run({ nebius, tavily });
      expect(queries).toEqual([`"${QUOTE}"`, "origin of the insanity quote"]);
      expect(events.find((e) => e.type === "planned")).toMatchObject({ rejectedQueries: ['">"'] });
      for (const event of events) expect(runEventSchema.safeParse(event).success).toBe(true);
    });

    it("keeps the exact quote first and cuts a long quoted span in later queries", async () => {
      const { tavily, queries } = tavilyFor(() => [NEWS]);
      const nebius = fakeNebius({ plan: () => ({ ...PLAN, queries: [`"${QUOTE}" first newspaper`] }) });
      await run({ nebius, tavily });
      expect(queries[0]).toBe(`"${QUOTE}"`);
      const fragment = /^"([^"]+)" first newspaper$/.exec(queries[1])?.[1] ?? "";
      expect(QUOTE).toContain(fragment);
      expect(fragment.split(" ").length).toBeGreaterThanOrEqual(6);
      expect(fragment.split(" ").length).toBeLessThanOrEqual(10);
    });

    it("cuts a quoted passage before the length check, so a query long only because of it still goes", async () => {
      const { tavily, queries } = tavilyFor(() => [NEWS]);
      const passage = `${QUOTE} ${"And so the old saying went on and on through the town. ".repeat(8)}`.trim();
      expect(`"${passage}" origin`.length).toBeGreaterThan(300);
      const nebius = fakeNebius({ plan: () => ({ ...PLAN, queries: [`"${passage}" origin`] }) });
      const events = await run({ nebius, tavily });
      expect(queries).toHaveLength(2);
      expect(queries[1]).toMatch(/^"[^"]+" origin$/);
      expect(events.find((e) => e.type === "planned")).not.toHaveProperty("rejectedQueries");
    });

    it("follows a quoted search that finds nothing with a looser one, and stops at five searches", async () => {
      // Only unquoted searches find anything.
      const { tavily, queries, options } = tavilyFor((q) => (q.includes('"') ? [] : [NEWS]));
      const planned = ['"over and over again" origin', "insanity quote origin", "insanity quote first newspaper", "insanity quote Einstein"];
      const nebius = fakeNebius({ plan: () => ({ ...PLAN, queries: planned }) });
      const events = await run({ nebius, tavily });
      // The exact quote is cut to a fragment once; the fragment, found empty too, is not loosened again.
      expect(queries).toHaveLength(5);
      expect(queries[0]).toBe(`"${QUOTE}"`);
      expect(queries[1]).toMatch(/^"[^"]+"$/);
      expect(queries.slice(2)).toEqual(['"over and over again" origin', "over and over again origin", "insanity quote origin"]);
      expect(options.map((o) => (o as { exactMatch: boolean }).exactMatch)).toEqual([true, true, true, false, false]);
      expect(events.filter((e) => e.type === "searched")).toHaveLength(5);
    });
  });

  it("crosses out a snippet that is on the page but isn't the saying, and asks Super", async () => {
    const nebius = fakeNebius({
      read: ({ model }) => (model === MODELS.lightning.id ? { ...READ, exact_snippet: "Knoxville News-Sentinel, 1981." } : READ),
    });
    const events = await run({ nebius });
    expect(events.find((e) => e.type === "escalated")).toMatchObject({ step: "read", reason: "the snippet is not the saying" });
    const node = events.find((e) => e.type === "node_added");
    expect(node?.type === "node_added" && node.node.check).toEqual({ status: "exact", score: 1 });

    const stubborn = await run({ nebius: fakeNebius({ read: () => ({ ...READ, exact_snippet: "Knoxville News-Sentinel, 1981." }) }) });
    const crossed = stubborn.find((e) => e.type === "node_added");
    expect(crossed?.type === "node_added" && crossed.node.check).toEqual({ status: "not_found", score: 1, reason: "not_the_saying" });
    expect(stubborn.find((e) => e.type === "judge_skipped")).toBeDefined();
    for (const event of stubborn) expect(runEventSchema.safeParse(event).success).toBe(true);
  });

  it("keeps a reader's date only where it sits on the page", async () => {
    const filler = Array.from({ length: 400 }, () => "lorem").join(" ");
    const text = `${filler} At the meeting a speaker said: "${QUOTE}." ${filler} A different talk was given in 1905. Sources: Basic Text 1975.`;
    const { tavily } = tavilyFor(() => [NEWS], () => text);
    const reading = { ...READ, page_date: "1905", cited_source: "the Basic Text", cited_source_date: "1975" };
    const events = await run({ nebius: fakeNebius({ read: () => reading }), tavily });
    const node = events.find((e) => e.type === "node_added");
    expect(node?.type === "node_added" && node.node).toMatchObject({ pageDate: null, citedSourceDate: "1975", date: "1975" });
  });

  it("never keeps a page date that names two years", async () => {
    // The lifespan sits at the top, where a page's own date would.
    const brainy = tavilyFor(() => [NEWS], () => `Mahatma Gandhi, October 2, 1869 - January 30, 1948. "${QUOTE}."`);
    const lifespan = await run({ nebius: fakeNebius({ read: () => ({ ...READ, page_date: "October 2, 1869 - January 30, 1948" }) }), tavily: brainy.tavily });
    expect(lifespan.find((e) => e.type === "node_added")).toMatchObject({ node: { pageDate: null, date: null } });
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

describe("overlongFields", () => {
  it("names each text field over 300 characters, and nothing for a reading within the cap", () => {
    expect(overlongFields(READ)).toEqual([]);
    expect(overlongFields({ ...READ, exact_snippet: "x".repeat(300) })).toEqual([]);
    expect(overlongFields({ ...READ, exact_snippet: "x".repeat(301), cited_source: "y".repeat(400) })).toEqual(["exact_snippet", "cited_source"]);
    // A reading that found no quote can still carry a field that long.
    expect(overlongFields({ ...READ, contains_quote: false, exact_snippet: null, page_date: "z".repeat(301) })).toEqual(["page_date"]);
  });
});
