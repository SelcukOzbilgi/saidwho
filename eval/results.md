# Eval results

Written by `pnpm eval` from runs made on 2026-10-14. Each quote in [quotes.jsonl](quotes.jsonl) was run with the sites that already wrote up its answer left out: Quote Investigator, Wikiquote, Wikipedia and the pages the answer comes from.

- Cascade: the app as it runs. Ultra plans, Lightning reads each page, Super follows citations and judges, and a step whose check fails is tried again on a bigger model.

Setups that searched for the same query got the same pages, from a shared cache. The Tavily credits are what each setup's searches cost when they were made.

The Code (commit) row gives the commit each setup's runs came from, with a count when they came from more than one. "-dirty" means src/ had changes that weren't committed, and "not recorded" means the run was logged before the commit was recorded.

A ✓ after a verdict means it matches the known answer, and after a year that it's within 2 years of the known earliest date. A year marked (older) is earlier than the known date. That is either a find or a misread date, so those are checked by hand.


|  | Cascade |
| --- | --- |
| Quotes run | 20 |
| Code (commit) | a53fccf |
| Verdict right | 13 of 20 |
| Earliest year within 2 years of the known one | 10 of 19 |
| Earlier than the known date (checked by hand) | 6 |
| Later than the known date | 2 |
| No date given | 1 |
| Last verdict set aside for citing unverified evidence | 0 |
| Stopped at the spending cap | 0 |
| Nebius cost, all quotes | $0.1528 |
| Nebius cost per quote | $0.0076 |
| Tavily credits | 118 |
| Calls with unknown cost | 0 |
| Time per quote | 44s |

| Quote | Known answer | Cascade |
| --- | --- | --- |
| insanity-same-thing | misattributed, 1981 | misattributed ✓, 1981 ✓ |
| be-the-change | misattributed, 1974 | correct ✗, 1913 (older) |
| good-men-do-nothing | misattributed, 1916 | misattributed ✓, 1867 (older) |
| well-behaved-women | misattributed, 1976 | misattributed ✓, 1976 ✓ |
| faster-horses | no_known_source, 1999 | misattributed ✗, 1999 ✓ |
| fish-climb-tree | no_known_source, 2004 | no_known_source ✓, no date |
| defend-to-the-death | misattributed, 1906 | misattributed ✓, 1906 ✓ |
| twenty-years-from-now | misattributed, 1990 | misattributed ✓, 1991 ✓ |
| think-you-can | correct, 1947 | correct ✓, 1947 ✓ |
| not-everything-counts | misattributed, 1963 | misattributed ✓, 1963 ✓ |
| leave-a-trail | misattributed, 1903 | misattributed ✓, 1903 ✓ |
| 640k-enough | no_known_source, 1985 | no_known_source ✓, 1981 (older) |
| let-them-eat-cake | misattributed, 1782 | misattributed ✓, 1765 (older) |
| gel-ne-olursan-ol | contested, no date | no_known_source ✗, 2012 |
| genius-perspiration | correct, 1898 | no_known_source ✗, 1903 ✗ |
| imagination-knowledge | correct, 1929 | correct ✓, 1929 ✓ |
| so-much-owed | correct, 1940 | correct ✓, 1940 ✓ |
| fear-itself | correct, 1933 | misattributed ✗, 1605 (older) |
| fifteen-minutes-fame | contested, 1968 | correct ✗, 1965 (older) |
| en-hakiki-mursit | correct, 1924 | no_known_source ✗, 1973 ✗ |
