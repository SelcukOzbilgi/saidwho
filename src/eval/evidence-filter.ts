import { isExtraRequote } from "../agent/queries";

// Leaves pages out of a saved run's evidence, so scripts/rejudge.ts can judge it
// again as if some searches had never been made or some hosts had been excluded.
// That measures what a search change would lose for the price of judging alone:
// no search runs again. What it can't show is what the dropped searches' places
// would have found instead.
//
//   requote  drops first-round searches that quote the whole saying again with
//            only generic origin words (isRequoteQuery). A page one of them
//            returned stays when a kept search returned it with text too.
//   hosts    drops every page on these hosts or their subdomains, as
//            excludeDomains would.
// A page dropped takes the Genealogist's leads from it along: the works it cited
// were never looked for, so the pages found for them go too.

export type EvidenceFilter = { requote: boolean; hosts: readonly string[] };

export const NO_FILTER: EvidenceFilter = { requote: false, hosts: [] };

export const filtersAnything = (filter: EvidenceFilter): boolean => filter.requote || filter.hosts.length > 0;

export const filterLabel = (filter: EvidenceFilter): string =>
  [filter.requote ? "requote" : "", filter.hosts.length > 0 ? `hosts ${filter.hosts.join(",")}` : ""].filter(Boolean).join(" + ") || "none";

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// The filter from --drop-searches and --drop-hosts, checked before anything runs.
export function parseEvidenceFilter(dropSearches: string | null, dropHosts: string | null): EvidenceFilter {
  if (dropSearches !== null && dropSearches !== "requote") throw new Error(`--drop-searches takes requote, not ${dropSearches}`);
  const hosts = (dropHosts ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
  for (const host of hosts) if (!HOST.test(host)) throw new Error(`--drop-hosts takes host names such as reddit.com, not ${host}`);
  if (dropHosts !== null && hosts.length === 0) throw new Error("--drop-hosts needs at least one host");
  return { requote: dropSearches === "requote", hosts: [...new Set(hosts)] };
}

// Whether the URL's host is one of the hosts or under one. A URL that doesn't
// parse is on none.
export function onHosts(url: string, hosts: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

// A first-round search as the run made it, with the URLs it returned with text.
export type LoggedSearch = { query: string; urls: readonly string[] };
// A node as the run logged it; foundVia is set on a page a lead found.
export type LoggedNode = { id: string; url: string; foundVia?: { node: string; work: string } | null };

export type DropReason = "host" | "search" | "lead";

export type Dropped = {
  // Places of the first-round searches the filter drops, in the order made.
  searches: Set<number>;
  // The nodes the filter drops, with why: on a dropped host, returned only by
  // dropped searches, or found for a lead from a dropped node.
  nodes: Map<string, DropReason>;
};

export function applyFilter(quote: string, searches: readonly LoggedSearch[], nodes: readonly LoggedNode[], filter: EvidenceFilter): Dropped {
  const droppedSearches = new Set(filter.requote ? searches.flatMap((s, i) => (isExtraRequote(s.query, quote) ? [i] : [])) : []);
  const keptUrls = new Set(searches.flatMap((s, i) => (droppedSearches.has(i) ? [] : s.urls)));
  const droppedOnlyUrls = new Set(searches.flatMap((s, i) => (droppedSearches.has(i) ? s.urls.filter((u) => !keptUrls.has(u)) : [])));
  const dropped = new Map<string, DropReason>();
  // In log order, so a lead's pages see whether the page it came from was dropped.
  for (const node of nodes) {
    if (onHosts(node.url, filter.hosts)) dropped.set(node.id, "host");
    else if (node.foundVia) {
      if (dropped.has(node.foundVia.node)) dropped.set(node.id, "lead");
    } else if (droppedOnlyUrls.has(node.url)) dropped.set(node.id, "search");
  }
  return { searches: droppedSearches, nodes: dropped };
}
