"use client";

import { useEffect } from "react";

import { RUN_PAGE } from "./sections";

// Access code links were made as /#code=..., when the form was on the home
// page. Such a link now goes on to the run page with its hash, which the form
// there reads. The hash stays in the browser, so the code still never reaches
// the server.
export function CodeLinkForward() {
  useEffect(() => {
    if (/^#(?:.*&)?code=/.test(window.location.hash)) window.location.replace(RUN_PAGE.href + window.location.hash);
  }, []);
  return null;
}
