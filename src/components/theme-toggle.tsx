"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { applyTheme, currentTheme, syncThemeColor, type Theme } from "./theme";

// Follows data-theme on <html>, so every toggle on the page and the script in
// layout.tsx agree. The server can't know the theme, so it renders "light";
// the icon itself is drawn by CSS from the attribute, and only the pressed
// state waits for hydration.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const serverTheme = (): Theme => "light";

// The new theme spreads from the button as a growing circle, so the switch
// reads as caused by the click; the clip-path reveal is the one in
// arunachalam's Animated Theme Toggler on 21st.dev. Browsers without view
// transitions, and anyone who asked for less motion, get the new colors at once.
export function switchTheme(origin: HTMLElement | null) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const root = document.documentElement;
  if (typeof document.startViewTransition !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    applyTheme(next);
    return;
  }
  // The CSS that turns off the default crossfade only applies while this is
  // set. Each switch tags it, so a quick second click isn't cut short when the
  // first one ends.
  const tag = String(Date.now() + Math.random());
  root.dataset.themeSwitch = tag;
  const transition = document.startViewTransition(() => applyTheme(next));
  transition.ready
    .then(() => {
      const box = origin?.getBoundingClientRect();
      const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const y = box ? box.top + box.height / 2 : 0;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    // A transition skipped by the browser still switched the theme.
    .catch(() => {});
  transition.finished.finally(() => {
    if (root.dataset.themeSwitch === tag) delete root.dataset.themeSwitch;
  });
}

// A round button with a sun that turns into a moon: the rays fold away and a
// shadow circle, masking the disc, slides across it to leave a crescent. The
// rays follow 000h's theme toggle on 21st.dev; plain CSS moves the parts,
// keyed on data-theme (see Shell in globals.css).
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);
  const button = useRef<HTMLButtonElement>(null);
  const mask = useId();

  // A theme saved on an earlier visit may differ from the system setting the
  // browser bar started with.
  useEffect(() => syncThemeColor(currentTheme()), []);

  return (
    <button
      ref={button}
      type="button"
      aria-label="Dark theme"
      aria-pressed={theme === "dark"}
      onClick={() => switchTheme(button.current)}
      className={cn(
        "theme-toggle inline-grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="theme-icon size-[1.35rem]">
        <mask id={mask}>
          <rect width="24" height="24" fill="white" />
          <circle className="theme-icon-shade" cx="25" cy="2" r="4.6" fill="black" />
        </mask>
        <circle className="theme-icon-disc" cx="12" cy="12" r="5" fill="currentColor" mask={`url(#${mask})`} />
        <g className="theme-icon-rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {RAYS.map((angle) => (
            <path key={angle} d="M12 1.75V3.6" transform={`rotate(${angle} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
  );
}

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];
