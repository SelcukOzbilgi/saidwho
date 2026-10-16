import Link from "next/link";

import { HeaderHeight } from "./header-height";
import { Wordmark } from "./logo-mark";

const NAV = [
  { href: "/#cases", label: "Cases" },
  { href: "/#run", label: "Run your own" },
  { href: "/#how-it-works", label: "How it works" },
];

// A quiet strip on every page, in the same column as the page below it, so a
// case page has a way back to the rest of the site. It stays at the top while
// the page scrolls under it, and HeaderHeight keeps anchor jumps clear of it.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 data-[tall]:relative">
      {/* The glass behind the bar. It reaches a little below the header and fades
          out there, so the page blurs into the bar instead of meeting a line. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -bottom-6 -z-10 bg-background/60 backdrop-blur-md backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 py-1 text-sm sm:px-6 sm:py-2">
        <Link href="/" className="inline-block py-2 font-serif text-lg font-semibold">
          <Wordmark />
        </Link>
        <nav aria-label="Site" className="-mx-2 flex flex-wrap items-center text-muted">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="inline-block px-2 py-2 underline-offset-4 hover:text-foreground hover:underline">
              {label}
            </Link>
          ))}
          <a
            href="https://github.com/SelcukOzbilgi/saidwho"
            className="inline-block px-2 py-2 underline-offset-4 hover:text-foreground hover:underline"
          >
            GitHub
          </a>
        </nav>
      </div>
      <HeaderHeight />
    </header>
  );
}
