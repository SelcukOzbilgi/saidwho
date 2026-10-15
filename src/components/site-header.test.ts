import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("links home, to the cases, the form, how it works and the source", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    for (const href of ["/", "/#cases", "/#run", "/#how-it-works", "https://github.com/SelcukOzbilgi/saidwho"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
