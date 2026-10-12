# Eval results

Written by `pnpm eval` from runs made on 2026-10-12. Each quote in [quotes.jsonl](quotes.jsonl) was run with the sites that already wrote up its answer left out: Quote Investigator, Wikiquote, Wikipedia and the pages the answer comes from.

- Cascade: the app as it runs. Lightning reads each page, Super plans, follows citations and judges, and a step whose check fails is tried again on a bigger model.
- All Ultra: every step on Nemotron 3 Ultra.
- All Lightning: every step on Nemotron 3.5 Lightning.

Setups that searched for the same query got the same pages, from a shared cache. The Tavily credits are what each setup's searches cost when they were made.

A ✓ after a verdict means it matches the known answer, and after a year that it's within 2 years of the known earliest date. A year marked (older) is earlier than the known date. That is either a find or a misread date, so those are checked by hand.

|  | Cascade | All Ultra | All Lightning |
| --- | --- | --- | --- |
| Quotes run | 20 | 20 | 20 |
| Verdict right | 14 of 20 | 14 of 20 | 9 of 20 |
| Earliest year within 2 years of the known one | 9 of 19 | 12 of 19 | 8 of 19 |
| Earlier than the known date (checked by hand) | 2 | 3 | 5 |
| Later than the known date | 4 | 3 | 3 |
| No date given | 4 | 1 | 3 |
| Verdict citing unverified evidence | 0 | 0 | 7 |
| Stopped at the spending cap | 0 | 0 | 0 |
| Nebius cost, all quotes | $0.0901 | $0.8514 | $0.0964 |
| Nebius cost per quote | $0.0045 | $0.0426 | $0.0048 |
| Tavily credits | 121 | 128 | 140 |
| Calls with unknown cost | 1 | 0 | 0 |
| Time per quote | 51s | 36s | 69s |

| Quote | Known answer | Cascade | All Ultra | All Lightning |
| --- | --- | --- | --- | --- |
| insanity-same-thing | misattributed, 1981 | misattributed ✓, 1980 ✓ | misattributed ✓, 1981 ✓ | misattributed ✓, 1981 ✓ |
| be-the-change | misattributed, 1974 | misattributed ✓, 2012 ✗ | misattributed ✓, 2015 ✗ | misattributed ✓, 1913 (older) |
| good-men-do-nothing | misattributed, 1916 | misattributed ✓, 1999 ✗ | misattributed ✓, 1867 (older) | misattributed ✓, 1916 ✓ |
| well-behaved-women | misattributed, 1976 | correct ✗, 1976 ✓ | misattributed ✓, 1976 ✓ | misattributed ✓, 1976 ✓ |
| faster-horses | no_known_source, 1999 | misattributed ✗, 1999 ✓ | misattributed ✗, 1999 ✓ | misattributed ✗, no date |
| fish-climb-tree | no_known_source, 2004 | misattributed ✗, 1898 (older) | misattributed ✗, 2013 ✗ | misattributed ✗, 1898 (older) |
| defend-to-the-death | misattributed, 1906 | misattributed ✓, 1906 ✓ | misattributed ✓, 1906 ✓ | misattributed ✓, 1906 ✓ |
| twenty-years-from-now | misattributed, 1990 | misattributed ✓, 1991 ✓ | misattributed ✓, 1991 ✓ | no verdict ✗ |
| think-you-can | correct, 1947 | misattributed ✗, no date | no_known_source ✗, 2014 ✗ | misattributed ✗, 2014 ✗ |
| not-everything-counts | misattributed, 1963 | misattributed ✓, no date | misattributed ✓, 1963 ✓ | misattributed ✓, 1963 ✓ |
| leave-a-trail | misattributed, 1903 | no_known_source ✗, no date | misattributed ✓, 1903 ✓ | no_known_source ✗, no date |
| 640k-enough | no_known_source, 1985 | no_known_source ✓, no date | misattributed ✗, 1981 (older) | misattributed ✗, 1945 (older) |
| let-them-eat-cake | misattributed, 1782 | misattributed ✓, 1765 (older) | misattributed ✓, 1767 (older) | misattributed ✓, 1765 (older) |
| gel-ne-olursan-ol | contested, no date | contested ✓, no date | contested ✓, no date | misattributed ✗, no date |
| genius-perspiration | correct, 1898 | correct ✓, 1903 ✗ | no verdict ✗ | misattributed ✗, 1932 ✗ |
| imagination-knowledge | correct, 1929 | correct ✓, 1929 ✓ | correct ✓, 1929 ✓ | misattributed ✗, 1929 ✓ |
| so-much-owed | correct, 1940 | correct ✓, 1940 ✓ | correct ✓, 1940 ✓ | correct ✓, 1940 ✓ |
| fear-itself | correct, 1933 | correct ✓, 1933 ✓ | correct ✓, 1933 ✓ | correct ✓, 1933 ✓ |
| fifteen-minutes-fame | contested, 1968 | contested ✓, 1967 ✓ | contested ✓, 1967 ✓ | misattributed ✗, 1965 (older) |
| en-hakiki-mursit | correct, 1924 | no_known_source ✗, 2019 ✗ | contested ✗, 1924 ✓ | contested ✗, 1996 ✗ |
