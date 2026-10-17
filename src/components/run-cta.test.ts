import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunCta } from "./run-cta";

describe("RunCta", () => {
  it("asks one question and links to the run page", () => {
    const html = renderToStaticMarkup(createElement(RunCta));
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="run-cta-title"');
    expect(html).toContain('href="/run"');
  });

  it("is rendered in place, so it reads without JavaScript", () => {
    const html = renderToStaticMarkup(createElement(RunCta));
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toContain("data-reveal");
  });
});
