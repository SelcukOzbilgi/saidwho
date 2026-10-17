"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { plainClick } from "./section-link";

// The wordmark in the header. On the home page it glides back to the top and
// drops the #section from the address, so a reload starts at the top too; on
// any other page it's a plain link home.
export function HomeLink({ className, children }: { className?: string; children?: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href="/"
      className={className}
      onClick={(event) => {
        if (pathname !== "/" || !plainClick(event)) return;
        event.preventDefault();
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
        // Keeps Next's own entry in history.state, so back and forward still work.
        if (window.location.hash) history.replaceState(history.state, "", window.location.pathname + window.location.search);
      }}
    >
      {children}
    </Link>
  );
}
