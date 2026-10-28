import { Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { GitHubMark, REPO_URL } from "./github-mark";
import { HomeLink } from "./home-link";
import { Wordmark } from "./logo-mark";
import { SectionLink } from "./section-link";
import { RUN_PAGE, SECTIONS } from "./sections";

// Where the project and the parts it runs on live.
const PROJECT = [
  { href: REPO_URL, label: "Source on GitHub" },
  { href: `${REPO_URL}#readme`, label: "README" },
  { href: "https://youtu.be/EpD1Z3okV88", label: "Demo video" },
  { href: `${REPO_URL}/blob/main/LICENSE`, label: "Apache-2.0 license" },
];

const BUILT_ON = [
  { href: "https://www.nvidia.com/en-us/ai-data-science/foundation-models/nemotron/", label: "NVIDIA Nemotron" },
  { href: "https://nebius.com/services/token-factory", label: "Nebius Token Factory" },
  { href: "https://tavily.com", label: "Tavily search" },
];

const link = "inline-block py-1 text-muted underline-offset-4 hover:text-foreground hover:underline";

// The foot of every page, at the bottom of its <main>: the name, what the site
// does, its sections, the project and what it's built on. The layout follows
// meschacirung's Footer Two on 21st.dev, a brand block beside link columns.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line pt-10 text-sm">
      <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <HomeLink className="inline-block rounded-sm font-serif text-2xl leading-none font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
            <Wordmark />
          </HomeLink>
          <p className="mt-3 max-w-xs leading-6 text-muted">
            Paste a quote you saw online and trace where it first appeared, with a link to every page it checked.
          </p>
          <StarOnGitHub />
        </div>

        <LinkGroup id="footer-site" title="On this site" nav>
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <SectionLink id={id} className={link}>
                {label}
              </SectionLink>
            </li>
          ))}
          <li>
            <Link href={RUN_PAGE.href} className={link}>
              {RUN_PAGE.label}
            </Link>
          </li>
        </LinkGroup>
        <LinkGroup id="footer-project" title="The project">
          {PROJECT.map(({ href, label }) => (
            <li key={href}>
              <a href={href} className={link}>
                {label}
              </a>
            </li>
          ))}
        </LinkGroup>
        <LinkGroup id="footer-built-on" title="Built on">
          {BUILT_ON.map(({ href, label }) => (
            <li key={href}>
              <a href={href} className={link}>
                {label}
              </a>
            </li>
          ))}
        </LinkGroup>
      </div>

      <p className="mt-10 border-t border-line py-5 text-muted">
        Built for the{" "}
        <a href="https://nebiusglobalaihackathon.devpost.com/" className="underline underline-offset-4 hover:text-foreground">
          Nebius x NVIDIA Global AI Hackathon
        </a>
        .
      </p>
    </footer>
  );
}

// Only the site's own sections are navigation; the project and built-on
// groups point elsewhere, so they stay out of the landmark list.
function LinkGroup({ id, title, nav, children }: { id: string; title: string; nav?: boolean; children: ReactNode }) {
  const Group = nav ? "nav" : "div";
  return (
    <Group aria-labelledby={nav ? id : undefined}>
      <p id={id} className="text-xs font-medium tracking-wider text-foreground uppercase">
        {title}
      </p>
      <ul className="mt-3 space-y-1">{children}</ul>
    </Group>
  );
}

// The repo link, with a nudge to star it. The star fills with the marker
// orange and turns one point on hover, the hover star from the Star on GitHub
// buttons on 21st.dev without their rainbow edge or a star count.
function StarOnGitHub() {
  return (
    <div className="mt-5">
      <a
        href={REPO_URL}
        className="star-nudge inline-flex items-center gap-2.5 rounded-sm border border-line bg-card px-4 py-2.5 font-medium transition-colors duration-150 hover:border-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        <GitHubMark className="size-[1.1rem]" />
        Star it on GitHub
        <Star aria-hidden="true" strokeWidth={1.8} className="star-nudge-icon size-4 text-accent-ink" />
      </a>
      <p className="mt-2 text-xs text-muted">A star helps other people find it.</p>
    </div>
  );
}
