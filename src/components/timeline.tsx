import type { ReactNode } from "react";

import type { EvidenceNode } from "../agent/events";
import { byDate } from "../lib/run-state";
import { Arrivals, Enter, RevealList } from "./case-motion";

type Marks = { earliest: string | null; misattribution: string | null };

// One group per year, oldest first; pages with no date go in a last group.
function columns(nodes: readonly EvidenceNode[]): { label: string; nodes: EvidenceNode[] }[] {
  const out: { label: string; nodes: EvidenceNode[] }[] = [];
  for (const node of byDate(nodes)) {
    const label = node.date ? node.date.slice(0, 4) : "No date";
    const last = out.at(-1);
    if (last?.label === label) last.nodes.push(node);
    else out.push({ label, nodes: [node] });
  }
  return out;
}

// How many of the timeline's columns a year with 1, 2 or 3+ cards takes, and how
// its cards sit inside them.
const SPAN: Record<number, string> = { 1: "", 2: "sm:col-span-2", 3: "sm:col-span-2 lg:col-span-3" };
const CARDS: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" };

export function Timeline({ nodes, marks }: { nodes: readonly EvidenceNode[]; marks: Marks }) {
  if (nodes.length === 0) return null;
  const years = columns(nodes);
  return (
    <section aria-label="Evidence timeline">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
        Where the quote turns up, oldest first
      </h2>
      {/* Years read left to right, then down, oldest first. A year takes as many
          columns as it has cards, up to a full row, so a year with one page shares
          its row with the next ones instead of leaving the rest of it empty. As a
          run adds pages, the cards after a new one glide to their new places. During
          a run each card comes in as it is found, so only a finished page's list
          reveals as it scrolls into view. */}
      <RevealList playFresh={false} each className="grid gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Arrivals>
          {years.map((column) => {
            const holdsEarliest = column.nodes.some((node) => node.id === marks.earliest);
            return (
              <Enter as="li" layout key={column.label} className={`min-w-0 ${SPAN[Math.min(column.nodes.length, 3)]}`}>
                <div className="reveal-item mb-3 flex items-center gap-2">
                  <span
                    className={`font-serif text-2xl font-semibold tabular-nums transition-colors duration-300 ${holdsEarliest ? "text-accent-ink" : ""}`}
                  >
                    {column.label}
                  </span>
                  <span className={`h-px flex-1 transition-colors duration-300 ${holdsEarliest ? "bg-accent/60" : "bg-line"}`} aria-hidden />
                </div>
                <ul className={`grid gap-3 ${CARDS[Math.min(column.nodes.length, 3)]}`}>
                  <Arrivals>
                    {column.nodes.map((node) => (
                      <Enter as="li" layout key={node.id} className="min-w-0">
                        <div className="reveal-item h-full">
                          <NodeCard node={node} marks={marks} />
                        </div>
                      </Enter>
                    ))}
                  </Arrivals>
                </ul>
              </Enter>
            );
          })}
        </Arrivals>
      </RevealList>
    </section>
  );
}

// Readers often copy the page's own quotation marks, and the "> " that marks a
// quoted line in page text; the card adds its own marks.
const unquote = (text: string): string =>
  text.replace(/^[ \t]*>[ \t]?/gm, "").replace(/^["'“”‘’«»„\s]+|["'“”‘’«»„\s]+$/g, "");

// Readers sometimes copy a page's Markdown, so a title shows up as _Sudden Death_.
// The card shows the words without the marks; the saved text keeps them.
export const unmark = (text: string): string =>
  text
    // As in Markdown, the marked words can't start or end with a space, so "5 * 3 * 2"
    // stays, and the marks have to sit at a word's edge, so "f**k" and "2*3*4" stay too.
    .replace(/(^|[^\p{L}\p{N}*])\*\*(\S(?:[^*\n]*\S)?)\*\*(?![\p{L}\p{N}*])/gu, "$1$2")
    .replace(/(^|[^\p{L}\p{N}_])__(\S(?:[^_\n]*\S)?)__(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/(^|[^\p{L}\p{N}*])\*(\S(?:[^*\n]*\S)?)\*(?![\p{L}\p{N}*])/gu, "$1$2")
    .replace(/(^|[^\p{L}\p{N}_])_(\S(?:[^_\n]*\S)?)_(?![\p{L}\p{N}_])/gu, "$1$2");

// Links come from search results; only web pages get to be one.
const webUrl = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

const CHECK = {
  exact: { mark: "✓", words: "On the page", look: "text-good" },
  near: { mark: "≈", words: "Close match on the page", look: "text-good" },
  not_found: { mark: "✗", words: "Not on the page", look: "text-bad" },
} as const;

function NodeCard({ node, marks }: { node: EvidenceNode; marks: Marks }) {
  const crossed = node.check.status === "not_found";
  const check = node.check.reason === "not_the_saying" ? { ...CHECK.not_found, words: "On the page, but not the saying" } : CHECK[node.check.status];
  const earliest = marks.earliest === node.id;
  const misattribution = marks.misattribution === node.id;
  // The two pages the verdict points to stand out from the rest, and ease into it
  // when the verdict arrives during a run.
  const ring = earliest
    ? "border-accent bg-accent/5 ring-2 ring-accent/30"
    : misattribution
      ? "border-bad/60 bg-bad/5 ring-1 ring-bad/25"
      : "border-line bg-card";

  return (
    <article
      id={`node-${node.id}`}
      className={`flex h-full scroll-mt-24 flex-col rounded-sm border p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-300 target:ring-2 target:ring-accent ${ring} ${crossed ? "opacity-60" : ""}`}
    >
      <header className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className="font-mono">{node.id}</span>
        <span className="truncate">{node.host}</span>
        {node.date && <span className="ml-auto shrink-0 tabular-nums">{node.date}</span>}
      </header>

      <Arrivals>
        {(earliest || misattribution) && (
          <Enter key="marks" rise={4} delay={0.3}>
            <p className="mb-2 flex flex-wrap gap-1.5">
              {earliest && <Badge className="bg-accent text-on-accent">Earliest the judge found</Badge>}
              {misattribution && <Badge className="bg-bad/15 text-bad">Where the wrong name shows up</Badge>}
            </p>
          </Enter>
        )}
      </Arrivals>

      {node.reader.exact_snippet && (
        <blockquote className={`font-serif text-[17px] leading-snug ${crossed ? "line-through decoration-bad decoration-2" : ""}`}>
          “{unmark(unquote(node.reader.exact_snippet))}”
        </blockquote>
      )}

      <dl className="mt-3 mb-3 space-y-1 text-xs text-muted">
        {node.attributedTo && (
          <Row label="Credited to">
            <span className="text-foreground">{unmark(node.attributedTo)}</span>
          </Row>
        )}
        {node.foundVia && (
          <Row label="Found via">
            <a href={`#node-${node.foundVia.node}`} className="py-1 underline decoration-line underline-offset-2 hover:decoration-foreground">
              {node.foundVia.node}
            </a>
            , looking for {unmark(node.foundVia.work)}
          </Row>
        )}
        {node.reader.cited_source && (
          <Row label="Cites">
            {unmark(node.reader.cited_source)}
            {/* Readers often put the date in the source's name already. */}
            {node.citedSourceDate && !node.reader.cited_source.includes(node.citedSourceDate) ? ` (${node.citedSourceDate})` : ""}
          </Row>
        )}
      </dl>

      <footer className="mt-auto flex items-center gap-2 border-t border-line pt-2 text-xs">
        <span className={`font-medium ${check.look}`}>
          {check.mark} {check.words}
        </span>
        <a
          href={webUrl(node.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-1.5 ml-auto max-w-[60%] truncate py-1.5 underline decoration-line underline-offset-2 hover:decoration-foreground"
          title={node.title}
        >
          {node.title || node.host}
        </a>
      </footer>
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}
