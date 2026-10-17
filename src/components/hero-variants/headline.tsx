import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { verdictWords } from "../../lib/run-state";
import { HeroReplay } from "../hero-replay";
import { VERDICT_LOOK } from "../verdict-card";
import styles from "./headline.module.css";
import type { HeroCaseProps } from "./types";

// /?hero=headline: no card; the quote as a headline, its credit corrected in place.
export function HeroHeadline({ featured, trace: { output, credit, earliest }, intro }: HeroCaseProps) {
  return (
    <div className={styles.headline}>
      <figure className={`hero-trace ${styles.case}`} aria-label="One quote, traced">
        <div className={styles.overline}>
          <span>One quote, traced</span>
          <HeroReplay />
        </div>

        <blockquote lang={featured.run.language ?? undefined} dir="auto" className={`${styles.quote} font-serif italic`}>
          “{featured.run.quote}”
        </blockquote>

        <dl className={styles.correction}>
          <div className={styles.credit}>
            <dt className={styles.label}>Usually credited to</dt>
            <dd className="font-serif">
              {/* Struck only when the run says the name is wrong. */}
              {output.verdict === "misattributed" ? (
                <s className={`strike no-underline ${styles.strike}`}>{credit}</s>
              ) : (
                credit
              )}
            </dd>
          </div>
          <div className={styles.origin}>
            <dt className={styles.label}>Earliest trace found</dt>
            <dd>
              <span className="font-serif text-accent-ink">
                <span className="sr-only">{earliest.trace}</span>
                <span aria-hidden="true" className={`marker ${styles.marker}`}>
                  {Array.from(earliest.trace).map((char, i) => (
                    <span key={i} className={styles.char} style={{ "--c": i } as CSSProperties}>
                      {char}
                    </span>
                  ))}
                </span>
              </span>
              {earliest.via && <span className={styles.via}>via {earliest.via}</span>}
            </dd>
          </div>
        </dl>

        <figcaption className={styles.verdict}>
          <p>
            <span className={`${styles.verdictWord} ${VERDICT_LOOK[output.verdict]}`}>{verdictWords(output.verdict)}</span>
            <span className="text-muted"> · {output.confidence} confidence</span>
          </p>
          <Link href={`/cases/${featured.caseId}`} className={styles.caseLink}>
            See every step <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </figcaption>
      </figure>

      <div className={styles.intro}>{intro}</div>
    </div>
  );
}
