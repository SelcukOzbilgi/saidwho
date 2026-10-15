import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { parseCaseLog } from "../cases/cases";
import type { RunEvent } from "../agent/events";
import { parseRunLog, readPages, readRunLog } from "./logs";

// A real log from before the commit was recorded: a gallery case, copied from an
// eval run on 2026-10-12. It has no code field.
const OLD = readFileSync(new URL("../cases/fear-itself.json", import.meta.url), "utf8");
const withCode = (code: unknown) => JSON.stringify({ ...JSON.parse(OLD), code });

describe("eval run logs", () => {
  const dir = mkdtempSync(join(tmpdir(), "saidwho-logs-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a log written before the commit was recorded, with code null", () => {
    expect(JSON.parse(OLD)).not.toHaveProperty("code");
    const path = join(dir, "fear-itself.json");
    writeFileSync(path, OLD);
    const log = readRunLog(pathToFileURL(path));
    expect(log?.code).toBeNull();
    expect(log?.ranAt).toBe("2026-10-12T14:45:43.100Z");
    expect(log?.events.length).toBeGreaterThan(5);
  });

  it("reads the commit from a new log, and rejects a malformed one", () => {
    expect(parseRunLog(withCode({ commit: "603995a", changes: null })).code).toEqual({ commit: "603995a", changes: null });
    expect(parseRunLog(withCode(null)).code).toBeNull();
    expect(() => parseRunLog(withCode({ commit: "603995a", dirty: true }))).toThrow();
  });

  it("gives null for a quote with no log yet", () => {
    expect(readRunLog(pathToFileURL(join(dir, "missing.json")))).toBeNull();
  });
});

describe("parseCaseLog", () => {
  it("takes an eval log with or without the commit, so one can be copied to the gallery", () => {
    expect(parseCaseLog(JSON.parse(OLD)).code).toBeUndefined();
    expect(parseCaseLog(JSON.parse(withCode({ commit: "603995a", changes: "1a2b3c4d" }))).code).toEqual({
      commit: "603995a",
      changes: "1a2b3c4d",
    });
    expect(() => parseCaseLog(JSON.parse(withCode({ commit: "not a commit", changes: null })))).toThrow();
  });
});

describe("readPages", () => {
  const { events } = parseRunLog(OLD);
  const CSPAN = "https://www.c-span.org/program/the-presidency/the-only-thing-we-have-to-fear-is-fear-itself/623622";

  it("names a page by the node it gave", () => {
    expect(readPages(events, "n2")).toEqual([
      { url: "https://www.fdrlibrary.org/first-inaugural-curriculum-hub", host: "fdrlibrary.org", tier: "lightning", node: "n2", lookingFor: null },
    ]);
    expect(readPages(events, "n99")).toEqual([]);
  });

  it("names a page the run read but kept nothing from, by its place among the readings or by its URL", () => {
    expect(readPages(events, "#8")).toEqual([{ url: CSPAN, host: "c-span.org", tier: "lightning", node: null, lookingFor: null }]);
    expect(readPages(events, "c-span")).toEqual(readPages(events, "#8"));
    expect(readPages(events, "#99")).toEqual([]);
    expect(readPages(events, "#0")).toEqual([]);
    expect(readPages(events, "")).toEqual([]);
    expect(readPages(events, "  ")).toEqual([]);
  });

  it("gives every page whose URL matches, each once, with the tier that read it first and the lead it was found for", () => {
    const again: RunEvent = { type: "page_read", tier: "super", costUsd: 0, usageKnown: true, latencyMs: 1, url: CSPAN, host: "c-span.org", outcome: "evidence", reason: null };
    const pages = readPages([...events, again], "gutenberg.org");
    expect(pages.map((p) => [p.url.split("/")[4], p.node, p.lookingFor])).toEqual([
      ["3600", null, null],
      ["5038", "n18", "Inaugural Address of Franklin D. Roosevelt"],
      ["925", "n15", "First Inaugural Address by Franklin D. Roosevelt"],
    ]);
    expect(readPages([...events, again], "c-span")).toEqual([{ url: CSPAN, host: "c-span.org", tier: "lightning", node: null, lookingFor: null }]);
  });
});
