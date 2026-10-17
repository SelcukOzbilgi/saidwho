// The home page's sections in page order, as the header and footer list them.
// Kept out of the client components so the server-rendered footer can read it.
export const SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "eval", label: "How well it does" },
  { id: "cases", label: "Cases" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

// "Run your own" has a page of its own, listed after the sections.
export const RUN_PAGE = { href: "/run", label: "Run your own" } as const;
