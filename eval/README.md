# Test set

`quotes.jsonl` holds 20 famous quotes whose origins have already been researched. I use them to check whether Said Who? gets the right answer: `pnpm investigate <id>` runs one of them, and ten finished runs are shown as [example cases](../src/cases/) with the known answer next to the run's verdict.

Each line records:
- an `id`, the quote as people usually share it, its language, and who it's usually credited to
- the earliest known source: who wrote it, where, when, and in what words
- when the wrong name first got attached, if it's known
- a verdict: `misattributed`, `correct`, `contested` or `no_known_source`
- links to the pages the answer comes from, and a short note

Most answers come from [Quote Investigator](https://quoteinvestigator.com/). The rest come from original records, like the British parliamentary record for a Churchill speech, or from encyclopedias and academic papers. I checked each date and wording against the page itself. During test runs, Said Who? isn't allowed to search sites that have already written up the answer, such as Quote Investigator, Wikiquote and Wikipedia, or the sites each answer comes from. It has to find the trail on its own.

Not every quote is misattributed. Six of them really were said by the person they're credited to. A tool that calls every famous quote fake would fail those.

Some answers are deliberately not clean. "Gel, gel, ne olursan ol yine gel" is usually credited to Mevlana (Rumi), but scholars say nobody knows who wrote it, so the right answer there is "contested". Saying so is the honest result, not a failure.
