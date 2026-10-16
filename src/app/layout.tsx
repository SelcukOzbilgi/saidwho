import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

// Schibsted Grotesk was drawn for a news group's papers, so labels and body
// text read like a newsroom's rather than a framework's default. latin-ext
// carries the Turkish letters in the saved cases.
const sans = Schibsted_Grotesk({
  variable: "--font-sans-face",
  subsets: ["latin", "latin-ext"],
});

// Ids, costs and timings, set like a wire service's figures.
const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

// Quotes and snippets are set in a book face, the way they'd look on the page they came from.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
});

const description = "Paste a quote you saw online and trace where it first appeared, with a link to every page it checked.";

// Pages below set their own title and description; the share image comes from
// opengraph-image.jpg and twitter-image.jpg in this folder.
export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: "Said Who?",
  description,
  openGraph: { type: "website", siteName: "Said Who?", title: "Said Who?", description, url: "/" },
  twitter: { card: "summary_large_image", title: "Said Who?", description },
};

// The browser bar takes the page's paper color, the same --background as globals.css.
// It follows the system setting; a theme picked on the page doesn't reach it.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
};

// Runs while the page is parsed, before anything is painted: a theme picked
// on the page wins, then the system setting. ThemeToggle writes the same key.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Next only turns smooth scrolling off for a route change when this is set,
      // so a new page opens at its top instead of gliding there.
      data-scroll-behavior="smooth"
      // THEME_SCRIPT sets data-theme before the first paint, so the DOM wins.
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
