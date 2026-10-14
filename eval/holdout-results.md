# Eval results

This is the held-out set. Its quotes were picked after the fixes that came from looking at the main set's failures, so none of them shaped the code. It is run rarely, so it stays that way.

Written by `pnpm eval` from runs made on 2026-10-14. Each quote in [holdout.jsonl](holdout.jsonl) was run with the sites that already wrote up its answer left out: Quote Investigator, Wikiquote, Wikipedia and the pages the answer comes from.

- Cascade: the app as it runs. Ultra plans, Lightning reads each page, Super follows citations and judges, and a step whose check fails is tried again on a bigger model.

Setups that searched for the same query got the same pages, from a shared cache. The Tavily credits are what each setup's searches cost when they were made.

The Code (commit) row gives the commit each setup's runs came from, with a count when they came from more than one. "-dirty" means src/ had changes that weren't committed, and "not recorded" means the run was logged before the commit was recorded.

A ✓ after a verdict means it matches the known answer, and after a year that it's within 2 years of the known earliest date. A year marked (older) is earlier than the known date. That is either a find or a misread date, so those are checked by hand.


|  | Cascade |
| --- | --- |
| Quotes run | 10 |
| Code (commit) | a53fccf |
| Verdict right | 10 of 10 |
| Earliest year within 2 years of the known one | 6 of 10 |
| Earlier than the known date (checked by hand) | 1 |
| Later than the known date | 3 |
| No date given | 0 |
| Last verdict set aside for citing unverified evidence | 0 |
| Stopped at the spending cap | 0 |
| Nebius cost, all quotes | $0.0701 |
| Nebius cost per quote | $0.0070 |
| Tavily credits | 58 |
| Calls with unknown cost | 0 |
| Time per quote | 37s |

| Quote | Known answer | Cascade |
| --- | --- | --- |
| wear-sunscreen | misattributed, 1997 | misattributed ✓, 1997 ✓ |
| lie-travels | misattributed, 1820 | misattributed ✓, 1859 ✗ |
| be-kind-hard-battle | misattributed, 1898 | misattributed ✓, 1897 ✓ |
| strongest-survives | misattributed, 1963 | misattributed ✓, 1963 ✓ |
| first-they-ignore | misattributed, 1918 | misattributed ✓, 1918 ✓ |
| premature-optimization | correct, 1974 | correct ✓, 1974 ✓ |
| advanced-technology-magic | correct, 1968 | correct ✓, 1962 (older) |
| je-pense-donc-je-suis | correct, 1637 | correct ✓, 1637 ✓ |
| luther-apple-tree | no_known_source, 1944 | no_known_source ✓, 2022 ✗ |
| be-yourself | no_known_source, 1999 | no_known_source ✓, 2024 ✗ |
