<h1 align="center">
  <img src="docs/banner.png" alt="Said Who? A quote traced back from a 2024 social media post, through a 2018 newspaper and a 2001 book, to a book from 1981." width="100%">
</h1>

<p align="center"><b>Who really said it?</b><br>Paste a quote you saw online. Said Who? looks for the place it first appeared and shows you the trail, with a link for every step.</p>

<p align="center">
  <a href="https://github.com/SelcukOzbilgi/saidwho/actions/workflows/ci.yml"><img src="https://github.com/SelcukOzbilgi/saidwho/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
</p>

<p align="center"><a href="https://saidwho.vercel.app"><b>Try it at saidwho.vercel.app</b></a></p>

## Why I'm building this

Quotes travel. Every time one gets shared it can lose a word, pick up a new one, or end up with a more famous name attached. A few years later everyone "knows" who said it, and nobody can point to where.

Take *"Insanity is doing the same thing over and over again and expecting different results."* It's usually credited to Albert Einstein, but there's no evidence he ever said it. The earliest match [Quote Investigator](https://quoteinvestigator.com/2017/03/23/same/) found is a 1981 newspaper report on an Al-Anon meeting in Knoxville, Tennessee.

Ask a chatbot where a quote comes from and you'll get a confident answer, and sometimes a source that doesn't exist. Said Who? works differently. Instead of guessing, it reads the pages it finds, checks that the quote is really on them, and only then tells you what it found.

## What you see

1. You paste a quote, and the name it's usually credited to if you know it.
2. Each step of the search shows up as it happens.
3. Each page that carries the quote gets a card showing the sentence copied from it. Cards sit in columns by year, oldest on the left. If the sentence isn't really on the page, the card is crossed out.
4. At the end you get a short verdict: whether the usual name holds up, the earliest source found, and how sure it is. The verdict links back to the cards it rests on.

Sometimes the honest answer is "people disagree" or "nothing old enough turned up". Said Who? says that rather than make something up.

## Example cases

The home page lists ten finished investigations. Each is a quote from the [test set](eval/), run once and saved as it happened. Each case has its own page, such as [/cases/insanity-same-thing](https://saidwho.vercel.app/cases/insanity-same-thing), where you can replay the run and see the known answer next to what Said Who? concluded.

Said Who? reaches the same verdict as the known answer in six of the ten, though the earliest source it finds isn't always the one on record. The other four are kept on purpose, and their pages say that the verdict differs.

| Quote | Usually credited to | Known answer | Said Who?'s verdict |
|---|---|---|---|
| "Insanity is doing the same thing over and over again..." | Albert Einstein | misattributed | misattributed |
| "Never in the field of human conflict was so much owed..." | Winston Churchill | said it | said it |
| "Be the change you wish to see in the world." | Mahatma Gandhi | misattributed | misattributed |
| "The only thing necessary for the triumph of evil..." | Edmund Burke | misattributed | misattributed |
| "Let them eat cake." | Marie Antoinette | misattributed | misattributed |
| "The only thing we have to fear is fear itself." | Franklin D. Roosevelt | said it | said it |
| "Gel, gel, ne olursan ol yine gel" | Mevlana (Rumi) | contested | no known source |
| "If I had asked people what they wanted..." | Henry Ford | no known source | misattributed |
| "Whether you think you can, or you think you can't..." | Henry Ford | said it | no known source |
| "Hayatta en hakiki mürşit ilimdir." | Mustafa Kemal Atatürk | said it | no known source |

Each run took 18 to 34 seconds and cost half a cent or less in model use, except "Gel, gel" at about one cent.

## How it works

Each quote goes through five steps, each with one job:

- **Planner** thinks of other ways the quote has been worded or translated, who might have said it, and what to search for. If you left the name blank, it also tries to say who the quote is usually credited to.
- **Search** runs up to five web searches through Tavily, always starting with the exact quote. Sites that have already written up the answer, such as Quote Investigator, Wikiquote and Wikipedia, are left out, so the trail has to be found from scratch.
- **Readers** go through up to 20 of the pages that come back. For each one they copy the sentence that carries the quote and note who it's credited to, the date, and any older source the page names.
- **Checker** looks for the copied sentence, or a very close match, in the page's own text. This step is plain code, not AI, so it can't be talked into a sentence the page doesn't have.
- **Judge** sees only the pages the Checker confirmed and writes the verdict. It's asked to back every claim with one of those pages. Plain code checks the pages it cites, and if one wasn't confirmed, the verdict is written once more.

Small, fast models do most of the reading. If a model call fails, it gets one more try. If the Checker can't find a reader's sentence on the page, a larger model reads that page again. If the Judge fails or cites a page the Checker didn't confirm, the verdict is written once more, usually by the largest model. Errors that would only happen again, like a rejected key or a rate limit, aren't retried, and nothing new starts once the budget is spent or the run is stopped.

<details>
<summary>Models and services</summary>

| Job | Model or service |
|-----|---------|
| Planner | NVIDIA Nemotron 3 Super |
| Readers | NVIDIA Nemotron 3.5 Lightning, and Nemotron 3 Super for a page read again |
| Judge | NVIDIA Nemotron 3 Super, and Nemotron 3 Ultra when a verdict fails a check |
| Search and page text | Tavily |
| Checker | Plain TypeScript |

The Nemotron models are served by [Nebius Token Factory](https://nebius.com/services/token-factory). The app is built with Next.js.

</details>

## Status

I'm building this for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/). Submissions close on October 30, 2026.

- [x] Project setup, with key handling and automatic checks on every change
- [x] Tried out all four Nemotron models, and checked that Tavily can read old sources like archive.org and Wikisource
- [x] A [test set](eval/) of 20 quotes whose origins have already been researched
- [x] [First full investigation](https://github.com/SelcukOzbilgi/saidwho/releases/tag/v0.1.0), start to finish, from the command line
- [x] The live timeline and verdict page
- [x] Ten finished example cases that can be played again
- [x] A [public demo](https://saidwho.vercel.app)
- [ ] Following the older sources a page names, to look for something earlier still

Milestones are posted under [Releases](https://github.com/SelcukOzbilgi/saidwho/releases). Notes on what worked and what didn't with the tools I'm using are in [FEEDBACK.md](FEEDBACK.md).

## Using the public demo

The demo is at [saidwho.vercel.app](https://saidwho.vercel.app). Anyone can browse the finished cases there for free and replay them step by step. To run a new investigation, you paste in your own Nebius and Tavily keys. They go to the app's server, are used for that one run, and are passed on only to Nebius and Tavily. They're never saved or written to logs. The free trial option on the form is off for now.

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

Open http://localhost:3000, paste a quote and the name it's usually credited to, and add your own keys. You can leave the name blank. The Planner then tries to name who it's usually credited to, and when it does, the run marks that name as the Planner's. Your keys are only needed for new runs; the example cases work without them.

The free trial option, which runs on the server's own keys, stays off unless all of these are set in `.env.local`:

| Variable | What it does |
|---|---|
| `NEBIUS_API_KEY`, `TAVILY_API_KEY` | The server's own keys |
| `LIVE_RUNS_ENABLED`, `TRIAL_RUNS_ENABLED` | Both must be `true` |
| `DAILY_BUDGET_USD` | At least `0.20`, which is what one trial run sets aside before it starts |

A run started from the page stops making new model calls once its estimated Nebius spend reaches $0.50 with your keys, or $0.10 on the trial.

### Running an investigation from the command line

```bash
pnpm investigate insanity-same-thing
```

This runs one quote from the test set and prints each step, the verdict and what it cost. Any `id` from `eval/quotes.jsonl` works. It also skips the sites the known answer comes from, so the run can't simply copy them. As a safety net, it starts no new model call once its estimated Nebius spend reaches $0.50, though calls already running still finish. Each run is saved to `.runs/`.

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
src/agent/        the investigation: planner, readers, checker, judge and retries
src/app/          the pages and the /api/investigate route
src/components/   the form, timeline, verdict card and case replay
src/cases/        the ten finished example cases
src/lib/          run state, streaming, and server code (keys, budget, providers)
eval/             the test set of 20 quotes with known origins
scripts/          the command-line investigation and the smoke tests
```

## Security

If you find a security problem, please report it privately. See [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
