// The home page's sections in page order, as the header and footer list them.
// Kept out of the client components so the server-rendered footer can read it.
export const SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "eval", label: "How well it does" },
  { id: "cases", label: "Cases" },
  { id: "run", label: "Run your own" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

// Sent on window when a link to "Run your own" is clicked on the home page, so
// the section can open with its own animation. The browser still follows the
// anchor as usual; a page opened on /#run reads the hash instead.
export const OPEN_RUN_EVENT = "saidwho:open-run";
