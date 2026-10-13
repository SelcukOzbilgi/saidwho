import { describe, expect, it } from "vitest";

import { mayHoldWork, namesWork } from "./library-pages";

const WORK = "The Lantern Keeper by Ada Whitcombe";
// Long enough to be a work's text rather than a record or a contents page.
const TEXT = "The Lantern Keeper. Chapter one. ".repeat(400);

// The archive.org item page the second eval counted against Cameron's book, as
// the search returned it: the site's menus and the item's details, no text.
const DETAILS_SHELL = `Keep the news in the Wayback Machine. Sign Fight for the Future's letter.
Internet Archive Audio
Featured
Top
Images
Featured
Top
Software
Featured
Top
Texts
Featured
Top
Video
Featured
Top
Search the history of more than 1 trillion
web pages.
Mobile Apps
Browser Extensions
Archive-It Subscription
Save Page Now
Capture a web page as it appears now for use as a trusted
citation in the future.
Please enter a valid web address
Informal sociology, a casual introduction to sociological thinking. --
Bookreader Item Preview
Share or Embed This Item
Flag this item for
Informal sociology, a casual introduction to sociological thinking. --
Notes
Some text runs to the gutter.
obscured text on leaf # 0005 inherent from the source
Cut off text on back cover inherent from the source
plus-circle Add Review comment Reviews
1,060
Previews
9
Favorites
DOWNLOAD OPTIONS
No suitable files to display here.
IN COLLECTIONS
Uploaded by
station27.cebu
on July 27, 2019
SIMILAR ITEMS (based on metadata)`;

describe("namesWork", () => {
  it("finds the work's title, whatever the case, accents or the author's place", () => {
    expect(namesWork('Full text of "The Lantern Keeper"', WORK)).toBe(true);
    expect(namesWork("Whitcombe, A. The lantern-keeper (1902)", WORK)).toBe(true);
    expect(namesWork("The Project Gutenberg eBook of My Life and Work, by Henry Ford and Samuel Crowther", "My Life and Work")).toBe(true);
    expect(namesWork("Les Confessions (Rousseau)/Livre VI - Wikisource", "Les Confessions by Jean-Jacques Rousseau")).toBe(true);
    expect(namesWork("Thoughts on the Present Discontents", "Thoughts on the Cause of the Present Discontents by Edmund Burke")).toBe(true);
    expect(namesWork("Söylev ve Demeçler", "SOYLEV")).toBe(true);
  });

  it("finds a one-word title, whoever the work is by", () => {
    expect(namesWork('Full text of "Confessions"', "Confessions by Jean-Jacques Rousseau")).toBe(true);
    expect(namesWork("Confessions - Wikisource", "Confessions (1782) by Jean-Jacques Rousseau")).toBe(true);
    expect(namesWork("Walden; or, Life in the Woods", "Walden by Henry David Thoreau")).toBe(true);
    expect(namesWork("Nature - Wikisource", "Nature, 1836 by Ralph Waldo Emerson")).toBe(true);
    expect(namesWork("Fahrenheit magazine", "Fahrenheit 451 by Ray Bradbury")).toBe(false);
    expect(namesWork("Henry David Thoreau: A Life", "Walden by Henry David Thoreau")).toBe(false);
  });

  it("leaves a part number out of the name", () => {
    expect(namesWork("The Confessions of Jean Jacques Rousseau, by Jean Jacques Rousseau", "Confessions, Book VI")).toBe(true);
  });

  // Each pair is a page the second eval counted against a cited work, and that work.
  it("turns down a title that shares only a word saying what kind of work it is, or when", () => {
    expect(namesWork("Microcomputing Magazine (May 1983)", "InfoWorld, vol. 3, no. 10 (May 11, 1981)")).toBe(false);
    expect(
      namesWork("The Project Gutenberg eBook of The Washington Historical Quarterly, Volume 5, 1914, ed. by", "The Cruise Industry News Quarterly, 1999"),
    ).toBe(false);
    expect(namesWork("PR ENGLISH LITERATURE PR English literature Literary ...", "Narcotics Anonymous literature (1980)")).toBe(false);
    expect(namesWork("Entertainment Marketing", "Marketing Week, 2001")).toBe(false);
    expect(namesWork("Jesuit education | Project Gutenberg", "The Journal of Education")).toBe(false);
    expect(namesWork("Byte Magazine, May 1981", "InfoWorld, May 1981")).toBe(false);
  });

  it("turns down a title that shares only the author's name", () => {
    expect(namesWork("The Collected Works of Mahatma Gandhi/Volume 8 - Wikisource, the free online library", "Indian Opinion, edited by Mahatma Gandhi")).toBe(false);
    expect(namesWork("Edmund Burke - Wikisource, the free online library", "Letter to William Smith, January 9, 1795 by Edmund Burke")).toBe(false);
  });

  it("turns down another volume of the same work", () => {
    const work = "The Collected Works of Mahatma Gandhi, Volume 12";
    expect(namesWork("The Collected Works of Mahatma Gandhi/Volume 8 - Wikisource, the free online library", work)).toBe(false);
    expect(namesWork("The Collected Works of Mahatma Gandhi, Vol. XII", work)).toBe(true);
  });

  it("ignores short and common words", () => {
    expect(namesWork("The Book of the Sea", "The Lay of the Land")).toBe(false);
    expect(namesWork("a sermon from the age", "a speech for the people")).toBe(false);
  });
});

describe("mayHoldWork", () => {
  it("accepts a long page titled after the work", () => {
    expect(mayHoldWork("https://archive.org/stream/lantern/lantern_djvu.txt", 'Full text of "The Lantern Keeper"', TEXT, WORK)).toBe(true);
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

  it("turns down an item's own page, which lists its files rather than its text", () => {
    const work = "Informal Sociology: a casual introduction to sociological thinking by William Bruce Cameron";
    const title = "Informal sociology, a casual introduction to sociological thinking. -- : Cameron, William Bruce : Free Download, Borrow, and Streaming : Internet Archive";
    expect(mayHoldWork("https://archive.org/details/informalsociolog0000came", title, DETAILS_SHELL, work)).toBe(false);
    // Even with a long description, an item page isn't the work.
    expect(mayHoldWork("https://archive.org/details/lantern", "The Lantern Keeper : Free Download", TEXT, WORK)).toBe(false);
    expect(mayHoldWork("https://www.gutenberg.org/ebooks/3913", "The Lantern Keeper by Ada Whitcombe | Project Gutenberg", TEXT, WORK)).toBe(false);
    // A page of the item's text is.
    expect(mayHoldWork("https://archive.org/details/lantern/page/n5/mode/2up", "The Lantern Keeper", TEXT, WORK)).toBe(true);
  });

  it("turns down a page too short to hold a work's text", () => {
    const url = "https://en.wikisource.org/wiki/The_Lantern_Keeper";
    expect(mayHoldWork(url, "The Lantern Keeper - Wikisource", "Contents. Chapter one. Chapter two.", WORK)).toBe(false);
    expect(mayHoldWork(url, "The Lantern Keeper - Wikisource", DETAILS_SHELL, WORK)).toBe(false);
  });

  it("turns down a page whose title names some other work", () => {
    expect(mayHoldWork("https://archive.org/stream/other/other_djvu.txt", 'Full text of "Annual Report of the Harbour Board"', TEXT, WORK)).toBe(false);
    const magazine = "https://archive.org/download/kilobaudmagazine-1983-05/Microcomputing_1983_May.pdf";
    expect(mayHoldWork(magazine, "Microcomputing Magazine (May 1983)", TEXT, "InfoWorld, vol. 3, no. 10 (May 11, 1981)")).toBe(false);
  });

  it("turns down a URL it can't read", () => {
    expect(mayHoldWork("not a url", "The Lantern Keeper", TEXT, WORK)).toBe(false);
  });
});
