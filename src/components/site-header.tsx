import Link from "next/link";

import { Wordmark } from "./logo-mark";

const NAV = [
  { href: "/#cases", label: "Cases" },
  { href: "/#run", label: "Run your own" },
  { href: "/#how-it-works", label: "How it works" },
];

// A quiet strip on every page, in the same column as the page below it, so a
// case page has a way back to the rest of the site.
export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 pt-2 text-sm sm:px-6 sm:pt-4">
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
    </header>
  );
}
