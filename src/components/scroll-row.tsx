"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// A row that scrolls sideways. The hint and the keyboard stop only show up when
// the row is wider than its box, so a phone's stacked years or a short row on a
// wide screen don't get either.
export function ScrollRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {overflows && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div
        ref={box}
        role={overflows ? "region" : undefined}
        aria-label={overflows ? label : undefined}
        tabIndex={overflows ? 0 : undefined}
        className="-mx-4 overflow-x-auto px-4 pb-3 focus-visible:outline-2 focus-visible:outline-accent-ink"
      >
        {children}
      </div>
    </>
  );
}
