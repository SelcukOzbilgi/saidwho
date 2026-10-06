# Test set

`quotes.jsonl` holds 20 famous quotes whose real origins are already known. I use them to check whether Said Who? gets the right answer.

Each line records:
- the quote as people usually share it, and who it's usually credited to
- the earliest known source: who wrote it, where, and when
- a verdict: `misattributed`, `correct`, `contested` or `no_known_source`
- links to the pages the answer comes from

Most answers come from [Quote Investigator](https://quoteinvestigator.com/). The rest come from original records, like the British parliamentary record for a Churchill speech, or from encyclopedias and academic papers. I checked each date and wording against the page itself. During test runs, Said Who? won't be allowed to search sites that have already written up the answer, such as Quote Investigator, Wikiquote and Wikipedia. It has to find the trail on its own.

Not every quote is misattributed. Six of them really were said by the person they're credited to. A tool that calls every famous quote fake would fail those.

Some answers are deliberately not clean. "Gel, gel, ne olursan ol yine gel" is usually credited to Mevlana (Rumi), but scholars say nobody knows who wrote it, so the right answer there is "contested". Saying so is the honest result, not a failure.
