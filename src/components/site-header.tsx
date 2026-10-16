import { HeaderHeight } from "./header-height";
import { HomeLink } from "./home-link";
import { Wordmark } from "./logo-mark";
import { SiteNav } from "./site-nav";

// A strip on every page, in the same column as the page below it, so a case
// page has a way back to the rest of the site. It stays at the top while the
// page scrolls under it, and HeaderHeight keeps anchor jumps clear of it.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 data-[tall]:relative">
      {/* The glass behind the bar. It reaches 1.5rem below the header and fades out
          only there, so the page blurs into the bar instead of meeting a line, and
          every row of the header, however many it wraps to, has the full glass. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -bottom-6 -z-10 bg-background/55 backdrop-blur-[10px] backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]"
      />
      {/* A soft halo in the page color keeps the name and links readable when
          something dark, like the run button, passes under the glass. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 py-2 text-[0.95rem] [text-shadow:0_0_1px_var(--background),0_0_2px_var(--background),0_0_2px_var(--background),0_0_4px_var(--background),0_0_10px_var(--background)] sm:px-6 sm:py-3">
        <HomeLink className="-mx-1 inline-block rounded-sm px-1 py-1.5 font-serif text-2xl leading-none font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink sm:text-[1.7rem]">
          <Wordmark />
        </HomeLink>
        <SiteNav />
      </div>
      <HeaderHeight />
    </header>
  );
}
