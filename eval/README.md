# Test set

`quotes.jsonl` holds 15 famous quotes whose real origins are already known. I use them to check whether Said Who? gets the right answer.

Each line records:
- the quote as people usually share it, and who it's usually credited to
- the earliest known source: who wrote it, where, and when
- a verdict: `misattributed`, `correct`, `contested` or `no_known_source`
- links to the pages the answer comes from

The answers come from [Quote Investigator](https://quoteinvestigator.com/) and Wikiquote. I checked each date and wording against the page itself. During test runs, Said Who? won't be allowed to search those two sites, so it has to find the trail on its own.

Some answers are deliberately not clean. "Gel, gel, ne olursan ol yine gel" is usually credited to Mevlana (Rumi), but historians disagree, so the right answer there is "contested". Saying so is the honest result, not a failure.
