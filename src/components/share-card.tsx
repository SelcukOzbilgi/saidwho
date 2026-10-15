import { ImageResponse } from "next/og";

import type { JudgeOutput } from "../agent/schemas";
import type { ExampleCase } from "../cases/cases";
import { verdictWords } from "../lib/run-state";
import { shareAnswer } from "../lib/share";

// The share image for a finished case, built once per case at build time and
// laid out like its card in the gallery: verdict, quote, who it's credited to,
// and the answer. The light theme's colors from globals.css, since the image
// can't follow the viewer's theme.

export const SHARE_SIZE = { width: 1200, height: 630 };

export const SHARE_ALT =
  "A Said Who? case card: the quote, who it is usually credited to, and what one run found about where it came from.";

const PAPER = "#f6f4ef";
const INK = "#1c1a16";
const MUTED = "#6b665c";
const LINE = "#e2ddd2";
const ACCENT = "#ef7d1a";

const VERDICT_COLOR: Record<JudgeOutput["verdict"], string> = {
  misattributed: "#b0291f",
  correct: "#236814",
  contested: "#7d5400",
  no_known_source: MUTED,
};

// The page fonts: Newsreader for quotes and headlines, Geist for labels. Static
// instances, since the renderer can't pick a weight from a variable font.
// Fetched at build time, like next/font fetches them for the pages.
const NEWSREADER = "https://fonts.gstatic.com/s/newsreader/v26/cY9qfjOCX1hbuyalUrK49dLac06G1ZGsZBtoBCzBDXXD9JVF438w";
const GEIST = "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_R";
// A stalled download fails the build after 30 seconds instead of hanging it.
const font = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch((error: unknown) => {
    throw new Error(`Couldn't load a share image font: ${error instanceof Error ? error.message : String(error)} ${url}`);
  });
  if (!res.ok) throw new Error(`Couldn't load a share image font: ${res.status} ${url}`);
  return res.arrayBuffer();
};
const [serif, serifSemibold, sans, sansMedium] = await Promise.all([
  font(`${NEWSREADER}eI_ADA.ttf`),
  font(`${NEWSREADER}pojADA.ttf`),
  font(`${GEIST}nOM4nQ.ttf`),
  font(`${GEIST}ruM4nQ.ttf`),
]);

// Shorter quotes set larger, so a short one still fills the card.
const quoteSize = (quote: string): number => (quote.length <= 30 ? 80 : quote.length <= 50 ? 68 : quote.length <= 70 ? 60 : 52);

export async function shareCard({ run }: ExampleCase): Promise<ImageResponse> {
  // A recorded case always starts with its quote.
  const quote = run.quote ?? "";
  const verdict = run.verdict?.output.verdict;
  const answer = shareAnswer(run);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 80px 60px",
          background: PAPER,
          color: INK,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontFamily: "Newsreader", fontWeight: 600, fontSize: 40 }}>
              Said Who<span style={{ color: ACCENT }}>?</span>
            </div>
            <div style={{ width: 132, height: 6, borderRadius: 3, background: ACCENT }} />
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: verdict ? VERDICT_COLOR[verdict] : MUTED,
            }}
          >
            {verdict ? verdictWords(verdict) : "No verdict"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontFamily: "Newsreader", fontSize: quoteSize(quote), lineHeight: 1.15 }}>
            {`“${quote}”`}
          </div>
          <div style={{ fontSize: 28, color: MUTED }}>{`Credited to ${run.popularAttribution ?? "no one in particular"}`}</div>
        </div>

        <div style={{ display: "flex", borderTop: `2px solid ${LINE}`, paddingTop: 28 }}>
          <div style={{ fontFamily: "Newsreader", fontWeight: 600, fontSize: 44, lineHeight: 1.15 }}>
            {answer ?? "The run ended without a verdict"}
          </div>
        </div>
      </div>
    ),
    {
      ...SHARE_SIZE,
      fonts: [
        { name: "Newsreader", data: serif, weight: 400, style: "normal" },
        { name: "Newsreader", data: serifSemibold, weight: 600, style: "normal" },
        { name: "Geist", data: sans, weight: 400, style: "normal" },
        { name: "Geist", data: sansMedium, weight: 500, style: "normal" },
      ],
    },
  );
}
