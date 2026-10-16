import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("links home, to each section, the form and the source", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    for (const href of ["/", "/#how-it-works", "/#eval", "/#cases", "/#run", "https://github.com/SelcukOzbilgi/saidwho"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("lists the sections in page order", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    const site = html.slice(html.indexOf('aria-label="Site"'));
    const order = ["/#how-it-works", "/#eval", "/#cases", "/#run"].map((href) => site.indexOf(`href="${href}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("names the theme switch and the phone menu, and marks no section before the page has scrolled", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    expect(html).toMatch(/<button[^>]*aria-label="Dark theme"[^>]*aria-pressed="false"/);
    expect(html).toContain('<summary aria-label="Menu"');
    expect(html).not.toContain("aria-current");
  });

  it("names the site for screen readers, since the logo stands in for a letter", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    expect(html).toContain('<span class="sr-only">Said Who?</span>');
    expect(html).toMatch(/<span aria-hidden="true">Said Wh<svg[^>]*aria-hidden="true"/);
  });
});
