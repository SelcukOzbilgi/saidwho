// The site's public address, for share previews, robots.txt and the sitemap.
// Vercel sets the production domain at build time, so a custom domain is picked
// up on its own; a local build falls back to the live site.
export const SITE_URL = new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "saidwho.vercel.app"}`);
