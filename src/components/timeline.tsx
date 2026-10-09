import type { EvidenceNode } from "../agent/events";
import { byDate } from "../lib/run-state";

type Marks = { earliest: string | null; misattribution: string | null };

// Year columns, oldest on the left; pages with no date go in a last column.
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

export function Timeline({ nodes, marks }: { nodes: readonly EvidenceNode[]; marks: Marks }) {
  if (nodes.length === 0) return null;
  return (
    <section aria-label="Evidence timeline">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
        Where the quote turns up, oldest first
      </h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-3">
        <ol className="flex min-w-max gap-4">
          {columns(nodes).map((column) => (
            <li key={column.label} className="w-72 shrink-0">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-serif text-2xl font-semibold tabular-nums">{column.label}</span>
                <span className="h-px flex-1 bg-line" aria-hidden />
              </div>
              <ul className="flex flex-col gap-3">
                {column.nodes.map((node) => (
                  <li key={node.id}>
                    <NodeCard node={node} marks={marks} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Readers often copy the page's own quotation marks; the card adds its own.
const unquote = (text: string): string => text.replace(/^["'“”‘’«»„\s]+|["'“”‘’«»„\s]+$/g, "");

// Links come from search results; only web pages get to be one.
const webUrl = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

const CHECK = {
  exact: { mark: "✓", words: "On the page", look: "text-good" },
  near: { mark: "≈", words: "Close match on the page", look: "text-good" },
  not_found: { mark: "✗", words: "Not on the page", look: "text-bad" },
} as const;

function NodeCard({ node, marks }: { node: EvidenceNode; marks: Marks }) {
  const crossed = node.check.status === "not_found";
  const check = CHECK[node.check.status];
  const earliest = marks.earliest === node.id;
  const misattribution = marks.misattribution === node.id;
  const ring = earliest ? "border-accent ring-2 ring-accent/30" : misattribution ? "border-bad/60" : "border-line";

  return (
    <article
      id={`node-${node.id}`}
      className={`arrive scroll-mt-24 rounded-xl border bg-card p-4 shadow-sm target:ring-2 target:ring-accent ${ring} ${crossed ? "opacity-60" : ""}`}
    >
      <header className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className="font-mono">{node.id}</span>
        <span className="truncate">{node.host}</span>
        {node.date && <span className="ml-auto shrink-0 tabular-nums">{node.date}</span>}
      </header>

      {(earliest || misattribution) && (
        <p className="mb-2 flex flex-wrap gap-1.5">
          {earliest && <Badge className="bg-accent text-white">Earliest the judge found</Badge>}
          {misattribution && <Badge className="bg-bad/15 text-bad">Where the wrong name shows up</Badge>}
        </p>
      )}

      {node.reader.exact_snippet && (
        <blockquote className={`font-serif text-[17px] leading-snug ${crossed ? "line-through decoration-bad decoration-2" : ""}`}>
          “{unquote(node.reader.exact_snippet)}”
        </blockquote>
      )}

      <dl className="mt-3 space-y-1 text-xs text-muted">
        {node.attributedTo && (
          <Row label="Credited to">
            <span className="text-foreground">{node.attributedTo}</span>
          </Row>
        )}
        {node.reader.cited_source && (
          <Row label="Cites">
            {node.reader.cited_source}
            {node.citedSourceDate ? ` (${node.citedSourceDate})` : ""}
          </Row>
        )}
      </dl>

      <footer className="mt-3 flex items-center gap-2 border-t border-line pt-2 text-xs">
        <span className={`font-medium ${check.look}`}>
          {check.mark} {check.words}
        </span>
        <a
          href={webUrl(node.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto max-w-[60%] truncate underline decoration-line underline-offset-2 hover:decoration-foreground"
          title={node.title}
        >
          {node.title || node.host}
        </a>
      </footer>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}
