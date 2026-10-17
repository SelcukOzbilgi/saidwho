import type { ReactNode } from "react";

import type { ExampleCase } from "../../cases/cases";
import type { earliestTrace } from "../verdict-card";

// The three ways of telling the featured case on the first screen, shown at
// /?hero=rewind, /?hero=headline and /?hero=run while one is picked. Each one
// renders everything under the wordmark: the intro (the two lines of copy and
// the two buttons, passed in as is) and the case. When one is chosen, the
// others and this switch go.
export const HERO_VERSIONS = ["rewind", "headline", "run"] as const;
export type HeroVersion = (typeof HERO_VERSIONS)[number];

export type HeroCaseProps = {
  featured: ExampleCase;
  trace: {
    output: NonNullable<ExampleCase["run"]["verdict"]>["output"];
    credit: string;
    earliest: NonNullable<ReturnType<typeof earliestTrace>>;
  };
  intro: ReactNode;
};
