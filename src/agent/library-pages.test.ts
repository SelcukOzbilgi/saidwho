import { describe, expect, it } from "vitest";

import { mayHoldWork, sharesWord } from "./library-pages";

const WORK = "The Lantern Keeper by Ada Whitcombe";
const TEXT = "The Lantern Keeper. Chapter one. ".repeat(40);

describe("sharesWord", () => {
  it("finds a shared title word, name or year, whatever the case or accents", () => {
    expect(sharesWord("Whitcombe, A. The lantern-keeper (1902)", WORK)).toBe(true);
    expect(sharesWord("A letter of 1902", "Notes, 1902")).toBe(true);
    expect(sharesWord("Söylev ve Demeçler", "SOYLEV")).toBe(true);
  });

  it("ignores short and common words", () => {
    expect(sharesWord("The Book of the Sea", "The Lay of the Land")).toBe(false);
    expect(sharesWord("a sermon from the age", "a speech for the people")).toBe(false);
  });
});

describe("mayHoldWork", () => {
  it("accepts a long page titled after the work", () => {
    expect(mayHoldWork("https://archive.org/stream/lantern/lantern_djvu.txt", "Full text of \"The Lantern Keeper\"", TEXT, WORK)).toBe(true);
    expect(mayHoldWork("https://books.google.com/books?id=abc", "The Lantern Keeper - Ada Whitcombe - Google Books", TEXT, WORK)).toBe(true);
  });

  it("turns down a library's help, guide, blog and catalog sites", () => {
    for (const url of ["https://help.archive.org/books", "https://guides.loc.gov/novels", "https://blog.archive.org/2020", "https://catalog.hathitrust.org/Record/1"]) {
      expect(mayHoldWork(url, "The Lantern Keeper", TEXT, WORK)).toBe(false);
    }
  });

  it("turns down a site's front page, search results and catalog records", () => {
    for (const url of [
      "https://archive.org/",
      "https://archive.org/search?query=lantern",
      "https://books.google.com/books/about/The_Lantern_Keeper.html?id=abc",
      "https://example-library.org/record/42",
    ]) {
      expect(mayHoldWork(url, "The Lantern Keeper", TEXT, WORK)).toBe(false);
    }
  });

  it("turns down a page too short to hold a work's text", () => {
    expect(mayHoldWork("https://archive.org/details/lantern", "The Lantern Keeper : Free Download", "Menu. Sign in. Upload.", WORK)).toBe(false);
  });

  it("turns down a page whose title names some other work", () => {
    expect(mayHoldWork("https://archive.org/stream/other/other_djvu.txt", "Full text of \"Annual Report of the Harbour Board\"", TEXT, WORK)).toBe(false);
  });

  it("turns down a URL it can't read", () => {
    expect(mayHoldWork("not a url", "The Lantern Keeper", TEXT, WORK)).toBe(false);
  });
});
