"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { GitHubMark, REPO_URL } from "./github-mark";
import { SectionLink } from "./section-link";
import { useActiveSection } from "./section-spy";
import { RUN_PAGE, SECTIONS, type SectionId } from "./sections";
import { ThemeToggle } from "./theme-toggle";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

// The header's links in page order, then Run your own, the source and the
// theme switch. From the lg width up they sit in one row, with an orange mark
// under the section in view that slides to the next one as the page scrolls
// (the sliding indicator from educalvolpz's Animated Tabs on 21st.dev), and on
// to Run your own when that page opens. Below it they fold into a menu; the
// source and the theme switch stay in the bar.
export function SiteNav() {
  const pathname = usePathname();
  const { active, follow } = useActiveSection(pathname === "/");
  const onRun = pathname === RUN_PAGE.href;
  const reduced = useReducedMotion();
  const mark = (
    <motion.span
      aria-hidden="true"
      layoutId={reduced ? undefined : "site-nav-mark"}
      // Only ever drawn after hydration, so the fade can start from nothing.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-3 bottom-1 h-0.5 bg-accent"
    />
  );
  const link = cn(
    "relative block rounded-sm px-3 py-2.5 font-medium text-muted transition-colors duration-150 hover:text-foreground aria-[current]:text-foreground",
    focusRing,
  );

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <nav aria-label="Site" className="hidden items-center lg:flex">
        <ul className="flex items-center">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <SectionLink id={id} current={active === id} onFollow={follow} className={link}>
                {label}
                {active === id && mark}
              </SectionLink>
            </li>
          ))}
          <li>
            <Link href={RUN_PAGE.href} aria-current={onRun ? "page" : undefined} className={link}>
              {RUN_PAGE.label}
              {onRun && mark}
            </Link>
          </li>
        </ul>
        <span aria-hidden="true" className="mx-3 h-5 w-px bg-line" />
        <a
          href={REPO_URL}
          className={cn(
            "flex items-center gap-2 rounded-sm px-3 py-2.5 font-medium text-muted transition-colors duration-150 hover:text-foreground",
            focusRing,
          )}
        >
          <GitHubMark className="size-[1.1rem]" />
          GitHub
        </a>
      </nav>

      {/* Below lg the source keeps an icon in the bar. */}
      <a
        href={REPO_URL}
        aria-label="Source on GitHub"
        className={cn(
          "inline-grid size-10 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-foreground lg:hidden",
          focusRing,
        )}
      >
        <GitHubMark className="size-5" />
      </a>
      <ThemeToggle />
      <SectionMenu active={active} onRun={onRun} onFollow={follow} />
    </div>
  );
}

// The phone menu is a <details>, so it opens without JS and the browser
// tells screen readers whether it's open. Its panel hangs below the bar
// instead of inside it, so opening it doesn't make the header taller.
function SectionMenu({
  active,
  onRun,
  onFollow,
}: {
  active: SectionId | null;
  onRun: boolean;
  onFollow: (id: SectionId) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  // Closes on Escape and on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (menu.current) menu.current.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      menu.current?.querySelector("summary")?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <details ref={menu} className="group relative lg:hidden" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary
        aria-label="Menu"
        className={cn(
          "inline-grid size-10 cursor-pointer list-none place-items-center rounded-full text-muted hover:bg-line/60 hover:text-foreground group-open:text-foreground [&::-webkit-details-marker]:hidden",
          focusRing,
        )}
      >
        <MenuIcon />
      </summary>
      <nav
        aria-label="Sections"
        // The bar's text halo is for the glass; on the opaque card it only smudges.
        className="menu-panel absolute top-full right-0 mt-2 w-60 rounded-sm border border-line bg-card p-1.5 text-base [text-shadow:none]"
      >
        <ul>
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <SectionLink
                id={id}
                current={active === id}
                onFollow={(section) => {
                  onFollow(section);
                  if (menu.current) menu.current.open = false;
                }}
                className={cn(
                  "flex items-center gap-3 rounded-sm px-3 py-2.5 font-medium text-muted hover:bg-line/50 hover:text-foreground aria-[current]:text-foreground",
                  focusRing,
                )}
              >
                {/* The same orange mark as the wide nav, as a dot beside the section in view. */}
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", active === id ? "bg-accent" : "bg-line")}
                />
                {label}
              </SectionLink>
            </li>
          ))}
          <li>
            <Link
              href={RUN_PAGE.href}
              aria-current={onRun ? "page" : undefined}
              onClick={() => {
                if (menu.current) menu.current.open = false;
              }}
              className={cn(
                "flex items-center gap-3 rounded-sm px-3 py-2.5 font-medium text-muted hover:bg-line/50 hover:text-foreground aria-[current]:text-foreground",
                focusRing,
              )}
            >
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", onRun ? "bg-accent" : "bg-line")} />
              {RUN_PAGE.label}
            </Link>
          </li>
        </ul>
      </nav>
    </details>
  );
}

// Two lines that cross into an X when the menu opens: one path traces a loop
// and its dash slides along it. From efferd's Menu Toggle Icon on 21st.dev,
// keyed on the details' open state instead of a prop, so it works without JS.
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="menu-icon size-6"
    >
      <path
        className="menu-icon-loop"
        d="M27 10 13 10C10.8 10 9 8.2 9 6 9 3.5 10.8 2 13 2 15.2 2 17 3.8 17 6L17 26C17 28.2 18.8 30 21 30 23.2 30 25 28.2 25 26 25 23.8 23.2 22 21 22L7 22"
      />
      <path d="M7 16 27 16" />
    </svg>
  );
}
