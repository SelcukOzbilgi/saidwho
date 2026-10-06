// Day 1 smoke test for Tavily: can we find and extract pages from the archives
// the Genealogist depends on, and does exclude_domains really exclude?
// Run: pnpm smoke:tavily   (about 8 credits)

import { parseServerEnv, requireOwnerKeys } from "../../src/lib/server/env-schema";
import { createTavilyClient } from "../../src/lib/server/providers/tavily";
import { redactSecrets } from "../../src/lib/server/safe-error";

const SOURCES = [
  { site: "archive.org", query: 'Darwin "On the Origin of Species" 1859 full text' },
  { site: "books.google.com", query: 'Emerson "Self-Reliance" essays 1841' },
  { site: "en.wikisource.org", query: "Gettysburg Address Lincoln text" },
] as const;

const EXCLUDED = ["quoteinvestigator.com", "wikiquote.org"];

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
};

async function main(): Promise<void> {
  const env = parseServerEnv(process.env);
  const { TAVILY_API_KEY: tavilyApiKey } = requireOwnerKeys(env, ["TAVILY_API_KEY"]);
  const client = createTavilyClient({ apiKey: tavilyApiKey });
  let credits = 0;

  console.log("1) Find one page per archive");
  const urls: string[] = [];
  for (const { site, query } of SOURCES) {
    const res = await client.search(query, { includeDomains: [site], maxResults: 3, searchDepth: "basic" });
    if (!res.ok) {
      console.log(`  ${site.padEnd(18)} ERROR ${res.error.kind} ${res.error.detail ?? ""}`);
      continue;
    }
    credits += res.data.usage?.credits ?? 0;
    const top = res.data.results[0];
    console.log(`  ${site.padEnd(18)} ${res.data.results.length} results ${res.latencyMs}ms  top: ${top?.url ?? "-"}`);
    if (top) urls.push(top.url);
  }

  console.log("\n2) exclude_domains");
  const excl = await client.search('"Be the change you wish to see in the world" origin', {
    excludeDomains: EXCLUDED,
    maxResults: 10,
  });
  if (excl.ok) {
    credits += excl.data.usage?.credits ?? 0;
    const leaked = excl.data.results.map((r) => hostOf(r.url)).filter((h) => EXCLUDED.some((d) => h.endsWith(d)));
    console.log(`  ${excl.data.results.length} results, excluded domains present: ${leaked.length ? leaked.join(", ") : "none"} -> ${leaked.length ? "FAIL" : "PASS"}`);
  } else {
    console.log(`  ERROR ${excl.error.kind} ${excl.error.detail ?? ""}`);
  }

  for (const depth of ["basic", "advanced"] as const) {
    console.log(`\n3) extract (${depth})`);
    if (urls.length === 0) {
      console.log("  no URLs to extract");
      break;
    }
    const res = await client.extract(urls, { extractDepth: depth, format: "text" });
    if (!res.ok) {
      console.log(`  ERROR ${res.error.kind} ${res.error.detail ?? ""}`);
      continue;
    }
    credits += res.data.usage?.credits ?? 0;
    for (const page of res.data.results) {
      const preview = page.rawContent.replace(/\s+/g, " ").slice(0, 90);
      console.log(`  OK   ${hostOf(page.url).padEnd(18)} ${String(page.rawContent.length).padStart(8)} chars  "${preview}"`);
    }
    for (const failed of res.data.failedResults ?? []) {
      console.log(`  FAIL ${hostOf(failed.url).padEnd(18)} ${redactSecrets(failed.error, [tavilyApiKey])}`);
    }
    console.log(`  ${res.latencyMs}ms`);
  }

  console.log(`\nCredits used (reported by Tavily): ${credits}`);
}

main().catch((err: unknown) => {
  console.error(
    "Smoke test crashed:",
    err instanceof Error ? `${err.name}: ${redactSecrets(err.message, [process.env.TAVILY_API_KEY]).slice(0, 200)}` : "unknown",
  );
  process.exitCode = 1;
});
