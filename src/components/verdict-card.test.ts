import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Rationale } from "./verdict-card";

const render = (text: string, confirmed: string[] = ["n2"]) =>
  renderToStaticMarkup(createElement(Rationale, { text, confirmed: new Set(confirmed) }));

describe("Rationale", () => {
  it("links an id in plain text, in brackets and in bold", () => {
    expect(render("See n2.")).toContain('href="#node-n2"');
    expect(render("See [n2].")).toContain('href="#node-n2"');
    const bold = render("See **[n2]**.");
    expect(bold).toContain("<strong>");
    expect(bold).toContain('href="#node-n2"');
  });

  it("crosses out an id no page backed up, in italics too", () => {
    const html = render("It leans on *n9*.");
    expect(html).toContain("<em>");
    expect(html).toContain("line-through");
    expect(html).not.toContain("#node-n9");
  });

  it("keeps titles in italics", () => {
    expect(render("In _Sudden Death_ (1983)")).toContain("<em>Sudden Death</em>");
  });
});
