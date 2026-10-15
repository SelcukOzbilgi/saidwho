import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
