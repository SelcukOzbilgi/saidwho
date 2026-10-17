import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Page not found</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold tracking-tight">
          Nobody said that<span className="text-accent">.</span>
        </h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          There&apos;s no page at this address. The finished cases are on the home page.
        </p>
        <p className="mt-6">
          <Link
            href="/"
            className="inline-block rounded-sm bg-foreground px-5 py-2.5 font-medium text-background hover:bg-accent hover:text-on-accent"
          >
            Back to Said Who?
          </Link>
        </p>
      </header>

      <SiteFooter />
    </main>
  );
}
