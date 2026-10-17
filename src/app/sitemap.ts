import type { MetadataRoute } from "next";

import { CASES } from "@/cases/cases";
import { SITE_URL } from "@/lib/site";

// The home page, the run page and every finished case.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL.href },
    { url: new URL("/run", SITE_URL).href },
    ...CASES.map(({ caseId, ranAt }) => ({ url: new URL(`/cases/${caseId}`, SITE_URL).href, lastModified: ranAt })),
  ];
}
