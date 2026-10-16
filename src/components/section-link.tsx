"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { OPEN_RUN_EVENT, type SectionId } from "./sections";

// A click that opens the link here, not in a new tab or window.
export const plainClick = (event: MouseEvent) =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

// A real link to a home page section ("/#cases"), so it works without JS and
// from a case page.
export function SectionLink({
  id,
  className,
  children,
  onFollow,
  current,
}: {
  id: SectionId;
  className?: string;
  children?: ReactNode;
  onFollow?: (id: SectionId) => void;
  current?: boolean;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={`/#${id}`}
      className={className}
      aria-current={current ? "location" : undefined}
      onClick={(event) => {
        if (pathname !== "/" || !plainClick(event)) return;
        onFollow?.(id);
        if (id === "run") window.dispatchEvent(new CustomEvent(OPEN_RUN_EVENT));
      }}
    >
      {children}
    </Link>
  );
}
