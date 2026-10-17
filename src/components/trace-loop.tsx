"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

// The Genealogist's loop on the How it works run map: a line from its step's
// node out to the left, up, and back into the Readers' node, since what it
// finds is read and checked again. The line is drawn from where the two nodes
// actually are, and drawn again whenever the list reflows, so it fits at every
// width and text size. Once it has drawn in, a dot runs it once for each round
// a run may take (globals.css times both from the map). It is decoration: the
// steps say the same in words.

type Geometry = { width: number; height: number; d: string; head: string };

// How far left of the nodes the line runs, and the radius of its corners, in px.
const OUT = 14;
const BEND = 8;

export function TraceLoop({ from, to, rounds }: { from: string; to: string; rounds: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    const container = ref.current?.parentElement;
    const start = container?.querySelector<HTMLElement>(`[data-step-node="${from}"]`);
    const end = container?.querySelector<HTMLElement>(`[data-step-node="${to}"]`);
    if (!container || !start || !end) return;

    const measure = () => {
      const box = container.getBoundingClientRect();
      // From each node's center and its untransformed width, so a node that is
      // scaled around its center while it plays in still gives its resting edge.
      const edge = (node: HTMLElement) => {
        const r = node.getBoundingClientRect();
        return { x: r.left + r.width / 2 - node.offsetWidth / 2 - box.left, y: r.top + r.height / 2 - box.top };
      };
      const { x: ax, y: ay } = edge(start);
      const { x: bx, y: by } = edge(end);
      const x = Math.max(1, Math.min(ax, bx) - OUT);
      setGeometry({
        width: box.width,
        height: box.height,
        d: `M ${ax} ${ay} H ${x + BEND} Q ${x} ${ay} ${x} ${ay - BEND} V ${by + BEND} Q ${x} ${by} ${x + BEND} ${by} H ${bx - 1}`,
        head: `M ${bx - 6} ${by - 4} L ${bx - 1} ${by} L ${bx - 6} ${by + 4}`,
      });
    };

    // A ResizeObserver reports once as soon as it starts, which takes the first measure.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(start);
    observer.observe(end);
    return () => observer.disconnect();
  }, [from, to]);

  return (
    <>
      <svg
        ref={ref}
        aria-hidden="true"
        width={geometry?.width ?? 0}
        height={geometry?.height ?? 0}
        className="pointer-events-none absolute top-0 left-0 overflow-visible text-accent"
        fill="none"
      >
        {geometry && (
          <>
            <path className="hiw-loop-path" d={geometry.d} pathLength={1} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            <path className="hiw-loop-head" d={geometry.head} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
      {geometry && (
        <span
          aria-hidden="true"
          className="hiw-loop-dot pointer-events-none absolute top-0 left-0 size-2 rounded-full bg-accent"
          style={{ offsetPath: `path("${geometry.d}")`, "--rounds": rounds } as CSSProperties}
        />
      )}
    </>
  );
}
