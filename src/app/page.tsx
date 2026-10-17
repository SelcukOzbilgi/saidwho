import type { Metadata } from "next";

import { CASES, FEATURED_CASE_ID, findCase } from "../cases/cases";
import { checkerRejections } from "../cases/checker-rejections";
import { CaseGallery } from "../components/case-gallery";
import { CodeLinkForward } from "../components/code-link-forward";
import { EvalNumbers } from "../components/eval-numbers";
import { FeaturedCase } from "../components/featured-case";
import { Hero, heroTrace } from "../components/hero";
import { HERO_VERSIONS, type HeroVersion } from "../components/hero-variants/types";
import { HowItWorks } from "../components/how-it-works";
import { RunCta } from "../components/run-cta";
import { SiteFooter } from "../components/site-footer";

// Only this page says it is the canonical "/"; set in the layout, it would reach
// run pages and the not-found page too, since child metadata merges shallowly.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The saved cases don't change between requests, so they are counted once.
const REJECTIONS = checkerRejections(CASES);

// Three ways of telling the case on the first screen while one is picked:
// /?hero=rewind, /?hero=headline and /?hero=run. Reading the query makes "/"
// render on each request instead of once at build; when one is chosen, this
// goes, with the version prop and the other versions.
export default async function Home({ searchParams }: PageProps<"/">) {
  const featured = findCase(FEATURED_CASE_ID);
  const asked = (await searchParams).hero;
  const hero = HERO_VERSIONS.find((v) => v === asked) as HeroVersion | undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-10 sm:px-6 sm:pb-14">
      <CodeLinkForward />
      {/* The first screen: the name, what it does, and the featured case in one move. */}
      <Hero featured={featured} version={hero} />

      {/* Every section after the first screen, one gap apart, so the page keeps one rhythm. */}
      <div className="flex flex-col gap-(--section-gap)">
        {/* What a run ends with comes next, so a first visit sees it before being asked for anything. */}
        {featured && <FeaturedCase example={featured} afterHero={heroTrace(featured) !== null} />}

        {/* Then how it got there, and how often it gets there, before the rest of the cases. */}
        <HowItWorks rejections={REJECTIONS} cases={CASES.length} />
        <EvalNumbers />

        <CaseGallery
          cases={featured ? CASES.filter((c) => c !== featured) : CASES}
          title={featured ? "More finished cases" : undefined}
        />

        {/* And then the visitor's own quote. */}
        <RunCta />

        <SiteFooter />
      </div>
    </main>
  );
}
