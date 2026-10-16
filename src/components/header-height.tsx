"use client";

import { useEffect, useRef } from "react";

// Keeps --site-header-height on the page root equal to the sticky header's
// rendered height, so a jump to a section stops below the header however many
// rows it wraps to and whatever the text size. globals.css falls back to a
// fixed value until this runs, so a page opened on a #section link is lined up
// again once the real height is known. When large text makes the header take more than
// a quarter of the window, it stops sticking so the page keeps room to read.
export function HeaderHeight() {
  const probe = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = probe.current?.closest("header");
    if (!header) return;
    const root = document.documentElement;
    const update = () => {
      const tall = header.offsetHeight > window.innerHeight / 4;
      header.toggleAttribute("data-tall", tall);
      root.style.setProperty("--site-header-height", tall ? "0px" : `${header.offsetHeight}px`);
    };
    update();
    // The browser jumped to the #section before the height was measured. If the
    // header now covers its top, jump again with the measured padding.
    const target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      const top = target.getBoundingClientRect().top;
      if (top >= 0 && top < header.offsetHeight) target.scrollIntoView();
    }
    const observer = new ResizeObserver(update);
    observer.observe(header);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      header.removeAttribute("data-tall");
      root.style.removeProperty("--site-header-height");
    };
  }, []);

  return <span ref={probe} hidden />;
}
