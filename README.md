<h1 align="center">
  <img src="docs/banner.png" alt="Said Who? A quote traced back from a 2024 social media post, through a 2018 newspaper and a 2001 book, to a book from 1981." width="100%">
</h1>

<p align="center"><b>Who really said it?</b><br>Paste a quote you saw online. Said Who? looks for the place it first appeared and shows you the trail, with a link for every step.</p>

<p align="center">
  <a href="https://github.com/SelcukOzbilgi/saidwho/actions/workflows/ci.yml"><img src="https://github.com/SelcukOzbilgi/saidwho/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
</p>

<p align="center"><a href="https://saidwho.online"><b>Try it at saidwho.online</b></a></p>

## Why I'm building this

Quotes travel. Every time one gets shared it can lose a word, pick up a new one, or end up with a more famous name attached. A few years later everyone "knows" who said it, and nobody can point to where.

Take *"Insanity is doing the same thing over and over again and expecting different results."* It's usually credited to Albert Einstein, but there's no evidence he ever said it. The earliest match [Quote Investigator](https://quoteinvestigator.com/2017/03/23/same/) found is a 1981 newspaper report on an Al-Anon meeting in Knoxville, Tennessee.

<p align="center"><img src="docs/why.jpg" alt="A quote passed from a 1981 newspaper to a book, a radio, a laptop and a phone, changing a little at each stop, until a name tag reading Einstein? is pinned to it." width="100%"></p>

Ask a chatbot where a quote comes from and you'll get a confident answer, and sometimes a source that doesn't exist. Said Who? works differently. Instead of guessing, it reads the pages it finds, checks that the quote is really on them, and only then tells you what it found.

## What you see

1. You paste a quote, and the name it's usually credited to if you know it.
2. Each step of the search shows up as it happens.
3. Each page that carries the quote gets a card showing the sentence copied from it. Cards sit in columns by year, oldest on the left. If the sentence isn't really on the page, the card is crossed out.
4. At the end you get a short verdict: whether the usual name holds up, the earliest source found, and how sure it is. The verdict links back to the cards it rests on.

Sometimes the honest answer is "people disagree" or "nothing old enough turned up". Said Who? says that rather than make something up.

<p align="center"><img src="docs/what-you-see.jpg" alt="Sources in columns by year: a 1981 book with a check mark, a 2001 magazine, a 2018 newspaper crossed out, and a 2024 phone, each with a highlighted sentence sticking out." width="100%"></p>

## Example cases

The home page lists ten finished investigations. Each is a quote from the [test set](eval/), run once and saved as it happened. Each case has its own page, such as [/cases/insanity-same-thing](https://saidwho.online/cases/insanity-same-thing), where you can replay the run and see the known answer next to what Said Who? concluded.

Eight of the ten come from the first full eval, run on October 12, Henry Ford's "Whether you think you can" from the third, on October 14 (see below), and Gandhi's was run again on October 15, after the Planner started searching for a likely first source by name and year. Said Who? reaches the same verdict as the known answer in eight of the ten, though the earliest source it finds isn't always the one on record. The other two are kept on purpose, and their pages say that the verdict differs. Each case's reasoning is the Judge's own words, kept as the run wrote them, and it can overstate: in the Henry Ford case it calls a 1947 Reader's Digest credit, printed after Ford died, a contemporaneous record.

| Quote | Usually credited to | Known answer | Said Who?'s verdict |
|---|---|---|---|
| "Insanity is doing the same thing over and over again..." | Albert Einstein | misattributed | misattributed |
| "Never in the field of human conflict was so much owed..." | Winston Churchill | said it | said it |
| "Be the change you wish to see in the world." | Mahatma Gandhi | misattributed | misattributed |
| "The only thing necessary for the triumph of evil..." | Edmund Burke | misattributed | misattributed |
| "Let them eat cake." | Marie Antoinette | misattributed | misattributed |
| "The only thing we have to fear is fear itself." | Franklin D. Roosevelt | said it | said it |
| "Gel, gel, ne olursan ol yine gel" | Mevlana (Rumi) | contested | contested |
| "If I had asked people what they wanted..." | Henry Ford | no known source | misattributed |
| "Whether you think you can, or you think you can't..." | Henry Ford | said it | said it |
| "Hayatta en hakiki mürşit ilimdir." | Mustafa Kemal Atatürk | said it | no known source |

Most runs took 25 to 39 seconds, Henry Ford's 52 and Gandhi's 61. Roosevelt's and Churchill's took three and four minutes, because Nebius answered slowly for part of that afternoon and one planning call had to be tried again. Each cost less than a cent in model use, except Gandhi's at about 3 cents, most of it a second verdict written on Nemotron 3 Ultra.

## How it works

Each quote goes through six steps, each with one job:

<p align="center"><img src="docs/how-it-works.jpg" alt="The six steps in a row: Planner, Search, Readers, Checker, Genealogist and Judge, with an arrow from Genealogist back to Readers." width="100%"></p>

- **Planner** thinks of other ways the quote has been worded or translated, who might have said it, and what to search for. If you left the name blank, it also tries to say who the quote is usually credited to. A plan that leaves nothing to search but the quote itself is asked for once more.
- **Search** runs up to five web searches through Tavily, always starting with the exact quote. Sites that have already written up the answer, such as Quote Investigator, Wikiquote and Wikipedia, are left out, so the trail has to be found from scratch. Plain code checks each query the Planner writes first: markup a model leaves in it, like a markdown quote mark or an escaped quote, comes off, one with no letters or almost nothing in it is never sent, and a long quoted saying in a later query is cut to a distinctive part of it, since pages often word a long saying a little differently. A query that only quotes the whole saying again with words like "origin" or "earliest appearance" is dropped, since it finds little the exact-quote search hasn't, and the Planner is asked instead for one or two searches that name the earliest source it suspects with a year or decade. When a search in quotes finds nothing, a looser one takes the place of the last planned search.
- **Readers** go through up to 20 of the pages that come back. For each one they copy the sentence that carries the quote and note who it's credited to, the date, and any older source the page names for that sentence. A source the page gives for another version on the same page doesn't count: one page about "Be the change" quotes Gandhi's 1913 passage, then credits the short line to Arleen Lorrance's 1974 book.
- **Checker** looks for the copied sentence, or a very close match, in the page's own text, ignoring case, accents, punctuation and footnote numbers stuck to the end of a word. It also checks that the sentence is the saying, or a wording or translation of it the Planner listed, and not some other sentence from the page. A date the Reader gives is kept only where it sits on the page: a page's date in its title, near its top or next to the sentence, and the date of an older source in the title, next to the sentence or next to where the page names that source. A date that names two years, like a lifespan, or a year from another calendar isn't kept at all. This step is plain code, not AI, so it can't be talked into a sentence the page doesn't have.
- **Genealogist** looks at the older works the confirmed pages name, such as the book a page says the quote came from. It picks up to three, looks for each one in digital libraries like archive.org, Wikisource and Project Gutenberg through Tavily, and sends what turns up through the Readers and Checker again. It goes back at most two rounds, and each page it finds shows which page's citation led to it. When pages that may hold a cited work's text don't have the saying in any wording the run knows, the Judge is told, as weak evidence: a library page may be another edition or only part of the work, and the work may word it differently. A library's help, search and catalog pages, an item's own page, pages too short to hold a work's text, and other works that only share a word with its title don't count as pages of the work. A search that finds none of its text says nothing about the work, so the Judge isn't told about it.
- **Judge** sees only the pages the Checker confirmed and writes the verdict, which is about whether the usual credit holds up. It's asked to back every claim with one of those pages. Plain code checks the pages it cites. If one wasn't confirmed, the verdict is set aside and written once more, and the second try is told what was wrong. A verdict that cites a page the Checker didn't confirm is never shown as the answer. Code also checks that the page named as the earliest gives the earliest date; if it doesn't, code names a confirmed page that does, or leaves the date out. When that page names an older source with a date and the verdict gives the page's own, later date, the verdict is written once more, told about it, and the second one is taken only if it moves the date earlier, to one a confirmed page backs, or answers the check below when that one asks too. Code never picks that date itself, since the Judge may have turned the source down. When the verdict calls the credit wrong because of an earliest page whose sentence shares little of the saying's wording, word pairs counted, and that page doesn't credit the usual name, the verdict is written once more too, shown that sentence and asked whether it is the saying or only a related idea. The second one is taken if it names another page or gives another verdict. When both checks ask, one second verdict answers both, and it is taken if it answers either. The Judge also traces how the quote got to the version people share: where it first appears, then each page where its wording, its language or the name it's credited to changed. The page shows those steps above the timeline, each one linked to its page.

Small, fast models do most of the reading. If a model call fails, it gets one more try. If the Checker can't find a reader's sentence on the page, or the sentence isn't the saying, a larger model reads that page again. If the Judge fails, cites a page the Checker didn't confirm, dates its earliest page by the wrong one of its dates, or calls the credit wrong on a page worded unlike the saying, the verdict is written once more, usually by the largest model. That happens once a run, whatever the reason, so a run makes at most four Judge calls. If the Judge runs out of room while thinking, it tries again with thinking off, and then once more without the lineage, so the lineage can't cost the run its verdict. Errors that would only happen again, like a rejected key or a rate limit, aren't retried, and nothing new starts once the budget is spent or the run is stopped.

Under the steps, the page shows what the run cost on Nebius and what the same calls would have cost at Nemotron 3 Ultra's prices. That second number takes the token counts each call reported and prices them at Ultra's rates. It isn't a separate run on Ultra, which would probably think longer and cost more.

<details>
<summary>Models and services</summary>

| Job | Model or service |
|-----|---------|
| Planner | NVIDIA Nemotron 3 Ultra |
| Readers | NVIDIA Nemotron 3.5 Lightning, and Nemotron 3 Super for a page read again |
| Genealogist | NVIDIA Nemotron 3 Super, to pick which cited works to look for |
| Judge | NVIDIA Nemotron 3 Super, and Nemotron 3 Ultra when a verdict fails a check |
| Search and page text | Tavily |
| Checker | Plain TypeScript |

The Nemotron models are served by [Nebius Token Factory](https://nebius.com/services/token-factory). The app is built with Next.js.

</details>

## How well it does

`pnpm eval` runs the twenty quotes in the test set, with Quote Investigator, Wikiquote, Wikipedia and each answer's own pages left out of the search. A held-out set of ten more quotes was never run until October 14, after every fix, so none of them shaped the code.

<p align="center"><img src="docs/eval.jpg" alt="A clipboard of quote cards, most checked and a few crossed out, next to a stopwatch and a stack of coins." width="75%"></p>

The third run, on October 14 at commit `a53fccf`, with the app's mix of models:

| | Test set | Held-out set |
|---|---|---|
| Verdict matches the known answer | 13 of 20 | 10 of 10 |
| Earliest year within two years of the known one | 10 of 19 | 6 of 10 |
| Nebius cost per quote | $0.0076 | $0.0070 |
| Time per quote | 44 s | 37 s |

On the test set that is no better than the first run, which got 14 of 20. Four quotes went from wrong to right, among them Muriel Strode's "leave a trail" and Henry Ford's "Whether you think you can", and five went from right to wrong. With thinking on, the Planner and the Judge sample at a temperature of 0.6, and two runs of the same quote share only a few searches, so one run per quote can't tell a fix from chance. The fixes were also measured by judging the saved evidence of both earlier runs again, three times each: right dates went from 70 to 100 of 192, and right verdicts from 136 to 141 of 204. All ten held-out verdicts match, but ten quotes is a small sample. Scores quote by quote are in [eval/results.md](eval/results.md) and [eval/holdout-results.md](eval/holdout-results.md).

A quote costs about 70% more than on October 12, mostly because the Planner moved from Nemotron 3 Super to Ultra. In the earlier runs Super returned a broken plan 7 times in 34, with stray markup in its searches or nothing usable to search, and Ultra's 34 plans had none.

The first full run, on October 12 at commit `baf49da`, ran the test set three ways:

| | The app's mix | Every step on Ultra | Every step on Lightning |
|---|---|---|---|
| Verdict matches the known answer | 14 of 20 | 14 of 20 | 9 of 20 |
| Earliest year within two years of the known one | 9 of 19 | 12 of 19 | 8 of 19 |
| Nebius cost per quote | $0.0045 | $0.0426 | $0.0048 |
| Time per quote | 51 s | 36 s | 69 s |

There, the app's mix got as many verdicts right as every step on Ultra, at about a tenth of the cost, and Ultra found the earliest date more often. Its scores are in [eval/results-2026-10-12.md](eval/results-2026-10-12.md).

What the third run's misses show:

- **An older idea is taken for the saying.** For "Be the change you wish to see in the world", the Judge found Gandhi's 1913 line "If we could change ourselves, the tendencies in the world would also change" and called the credit to Gandhi right. A search for a likely first source by name and year has since found Arleen Lorrance's 1974 book. For Roosevelt's "The only thing we have to fear is fear itself", it found Francis Bacon's "Nothing is terrible except fear itself" and called the credit wrong. Both are related ideas in other words, not earlier printings of the saying. Since then, a verdict that calls the credit wrong on such a page is written once more (see How it works). Judging the third run's saved evidence again, three times each, Roosevelt's verdict was right 3 times out of 3 with that step and once without it, and Henry Ford's "faster horses" 2 times against none. Burke's "triumph of evil" went the other way, once in 3, when the second Judge set aside John Stuart Mill's 1867 sentence. Gandhi's case isn't covered, since that verdict calls the credit right.
- **Older dates are related passages or later accounts.** Six dates came out earlier than the known one. Two are the related ideas above, Gandhi's 1913 and Bacon's 1605. John Stuart Mill's 1867 line about good men who "look on and do nothing" is a related passage too, and 1765 is the year Rousseau wrote the "brioche" passage, which was published in 1782. For Bill Gates's "640K", 1981 is the year a page says he said it, not the date of anything printed then; the Checker keeps a year written next to the saying. For Warhol, a page mentions a 1965 article about the curator Henry Geldzahler that quotes Warhol in other words, "no one will be famous for more than a week". The run didn't find that article.
- **The Judge can be too strict.** For Edison's "Genius is one percent inspiration", it had a 1903 Harper's credit to Edison, from his own lifetime, and still said there was no known source. For "Hayatta en hakiki mürşit ilimdir", it set the 1924 credit to Atatürk aside because the run didn't find the cited works' text.
- **Disputes get missed.** For "Gel, gel, ne olursan ol" and Warhol's "fifteen minutes of fame", the test set says the credit is contested. The Judge called the first unsourced and the second right.
- **"Faster horses" still sits on a fine line.** The test set says there's no known source, since the earliest versions imagine what Ford might have said. The app's mix called it misattributed in all three runs.

What the eval showed about Tavily and Token Factory themselves is in [FEEDBACK.md](FEEDBACK.md).

## Status

I'm building this for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/). Submissions close on October 30, 2026.

- [x] Project setup, with key handling and automatic checks on every change
- [x] Tried out all four Nemotron models, and checked that Tavily can read old sources like archive.org and Wikisource
- [x] A [test set](eval/) of 20 quotes whose origins have already been researched
- [x] [First full investigation](https://github.com/SelcukOzbilgi/saidwho/releases/tag/v0.1.0), start to finish, from the command line
- [x] The live timeline and verdict page
- [x] Ten finished example cases that can be played again
- [x] A [public demo](https://saidwho.online)
- [x] Following the older sources a page names, to look for something earlier still
- [x] An eval of the whole test set, run three ways, with [the results](eval/results.md)
- [x] A held-out set of ten quotes that played no part in the fixes, with [its results](eval/holdout-results.md)

Milestones are posted under [Releases](https://github.com/SelcukOzbilgi/saidwho/releases), and [CHANGELOG.md](CHANGELOG.md) lists what each one changed. Notes on what worked and what didn't with the tools I'm using are in [FEEDBACK.md](FEEDBACK.md).

## Using the public demo

The demo is at [saidwho.online](https://saidwho.online). Anyone can browse the finished cases there for free and replay them step by step. To run a new investigation, you paste in your own Nebius and Tavily keys. They go to the app's server, are used for that one run, and are passed on only to Nebius and Tavily. They're never saved or written to logs. The run itself is saved: the quote, the snippets it found and its verdict. When it ends, the page shows a link to it that anyone can open. The run page also lists the runs you started from that browser, newest first, each with its link. That list is kept in the browser's own storage, not on the server, so it doesn't follow you to another device, and you can clear it. A run that ends before it plans or searches anything, as one with a rejected key does, isn't saved. The free trial, which runs on my keys, is only on when I switch it on, and then it can be limited to people with an access code. Hackathon judges get one in the testing instructions.

## Running it locally

To run it you need Node.js 24 and pnpm. To commit changes, also install [gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`). `pnpm install` sets up a check that blocks any commit containing a leaked key, and that check needs gitleaks.

```bash
git clone https://github.com/SelcukOzbilgi/saidwho.git
cd saidwho
pnpm install
cp .env.example .env.local   # then add your Nebius and Tavily keys
pnpm dev
```

### Using it locally

Open http://localhost:3000/run, paste a quote and the name it's usually credited to, and add your own keys. You can leave the name blank. The Planner then tries to name who it's usually credited to, and when it does, the run marks that name as the Planner's. Your keys are only needed for new runs; the example cases work without them.

The free trial option, which runs on the server's own keys, stays off unless all of these are set in `.env.local`:

| Variable | What it does |
|---|---|
| `NEBIUS_API_KEY`, `TAVILY_API_KEY` | The server's own keys |
| `LIVE_RUNS_ENABLED`, `TRIAL_RUNS_ENABLED` | Both must be `true` |
| `DAILY_BUDGET_USD` | At least `0.30`, which is what one trial run sets aside before it starts |
| `TRIAL_ACCESS_CODE` | Optional. When set, only someone who enters this code gets a trial run |

With `TRIAL_ACCESS_CODE` set, the form shows an access code field, and a link ending in `/run#code=<the code>` fills it in (an older `/#code=` link goes on to the run page too). The code is checked on the server and never sent to the browser, and the part of a link after `#` never reaches the server. Each try with a wrong or missing code uses up one of the visitor's hourly runs, so guessing is slow. That count is per address, though, so the code has to be unguessable on its own: at least 20 characters, and only letters, digits and `-`, `_`, `.` or `~`, so the link carries it unchanged. Make one with something like `openssl rand -base64 18 | tr '+/' '-_'`. If the attempt can't be counted, the code isn't checked and no trial run starts.

Codes with a set number of runs, one for a single test run, say, or 50 for a group, work next to it once runs are saved to Supabase (below). Make one with `pnpm trial-code --runs 50 --label judges`. It writes the code to `~/.saidwho/codes/judges.txt`, which only you can read, and prints one `insert` line to run in the Supabase SQL Editor. That line holds the code's hash, never the code, and the table keeps only the hash. Each run started with the code takes one of its runs, and a run the budget turns down gives its run back. Once they're all taken, the code is refused and the page says it's used up. The code is checked like `TRIAL_ACCESS_CODE`, after the attempt is counted against the visitor's hourly runs, and it skips the daily trial count too. These codes work only while `TRIAL_ACCESS_CODE` is set, since that is what makes the trial ask for a code; to hand out only counted codes, set it to one you keep to yourself. `select label, used_runs, max_runs from public.trial_codes;` shows what each code has left, and deleting a code's row turns it off. If the database fails partway through counting, a code can lose a run that never started, since an unclear count is never given back; `update public.trial_codes set used_runs = used_runs - 1 where label = 'judges';` returns it.

A run started from the page stops making new model calls once its estimated Nebius spend reaches $0.50 with your keys, or $0.10 on the trial.

One visitor can start up to 10 runs an hour on any keys (`RUNS_PER_IP_PER_HOUR`), and up to 3 trial runs a UTC day (`TRIAL_RUNS_PER_IP_PER_DAY`). A visitor is counted by their IP address, as Vercel reports it. Anywhere else the address can't be trusted, since the visitor could send any value, so all visitors share one count. Only a keyed hash of the address is kept. In Supabase, ended counts are deleted a batch at a time as later runs are counted, starting an hour after their hour or day ends, so a hash can stay a while longer when the site is quiet. Run locally, all trial runs share one count, so raise `TRIAL_RUNS_PER_IP_PER_DAY` in `.env.local` for a demo with more than 3. Runs with the right access code don't count against `TRIAL_RUNS_PER_IP_PER_DAY`, since several people with the code may share one address. The hourly limit still applies to them, and the daily budget caps what they spend together.

To save runs and give each one a public link at `/runs/<id>`, create a Supabase project, run [`supabase/migrations/`](supabase/migrations/) on it, and set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the project's secret key) in `.env.local`. The trial budget and the per-visitor counts are then kept there too, so every server shares them. Without these two variables, runs aren't saved, and each server counts the budget and the visitors in its own memory, starting over when it restarts. On Vercel, where one deployment can run many servers at once, that would let the limits slip, so there the trial stays off until both are set; runs on a visitor's own keys still work. The app works the same otherwise.

If the shared counts can't be reached, no trial run starts, since it would spend the server's money with nothing counting it. A run on your own keys still starts.

### Running an investigation from the command line

```bash
pnpm investigate insanity-same-thing
```

This runs one quote from the test set and prints each step, the verdict and what it cost. Any `id` from `eval/quotes.jsonl` works. It also skips the sites the known answer comes from, so the run can't simply copy them. As a safety net, it starts no new model call once its estimated Nebius spend reaches $0.50, though calls already running still finish. Each run is saved to `.runs/`.

### Running the eval

```bash
pnpm eval
```

This runs every quote in the test set three ways and scores each run against the known answer: the way the app runs it, with every step on Nemotron 3 Ultra, and with every step on Nemotron 3.5 Lightning. The scores go to `eval/results.md`. `--setup cascade` runs only the app's way, and `--only insanity-same-thing,be-the-change` runs only those quotes. Each run is saved to `.runs/eval/`, and a quote that already has a log there isn't run again, so a stopped eval picks up where it left off. In the third eval, one quote run the app's way cost about three quarters of a cent of Nebius ($0.0076) and about 6 Tavily credits (118 for the twenty).

### Adding an example case

1. Run `pnpm investigate <id>`.
2. Copy the log it writes to `.runs/` into `src/cases/<id>.json`.
3. Import it in `src/cases/cases.ts` and add it to the list there.
4. Run `pnpm test`. It checks that each case is a finished run of its test-set quote and never read the sites its known answer comes from.

### Other commands

| Command | What it does |
|---|---|
| `pnpm test` | Runs the tests |
| `pnpm lint`, `pnpm typecheck` | Run the same checks as CI |
| `pnpm smoke:nebius`, `pnpm smoke:tavily` | Make a few small real calls to check that your keys work |

## Where things are

```text
src/agent/        the investigation: planner, readers, checker, genealogist, judge and retries
src/app/          the pages and the /api/investigate route
src/components/   the form, timeline, verdict card and case replay
src/cases/        the ten finished example cases
src/lib/          run state, streaming, and server code (keys, budget, limits, providers)
src/eval/         the test sets' format, how a run is scored, the eval's arguments, run logs,
                  results files and code fingerprints, and the spending cap and evidence
                  filters scripts/rejudge.ts uses
eval/             the test set of 20 quotes and the held-out set of 10, their scores, and
                  the script that runs the eval as a Nebius Serverless AI job
supabase/         the tables for saved runs, the trial budget, per-visitor limits and
                  counted access codes
scripts/          the command-line investigation, the eval and the smoke tests, plus
                  rejudge.ts, which judges saved runs again (see eval/README.md),
                  saved-runs.ts, which rebuilds what a saved run's Judge saw,
                  trial-code.ts, which makes access codes with a set number of runs,
                  and the setup of the pre-commit secret scan
docs/             the README's pictures; social-preview.jpg is the GitHub repository's
                  preview image
```

Each step in How it works, and where its code is:

```text
Planner, Readers, Genealogist   src/agent/orchestrator.ts (the Genealogist's library
                                page rules are in library-pages.ts)
Search                          src/agent/orchestrator.ts, with query checks in queries.ts
Checker                         src/agent/verifier.ts
Judge                           src/agent/judge.ts, and its checks in judge-check.ts
```

## Security

If you find a security problem, please report it privately. See [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
