<h1 align="center">
  <img src="docs/banner.png" alt="Said Who? A quote traced back from a 2024 social media post, through a 2018 newspaper and a 2001 book, to a book from 1981." width="100%">
</h1>

<p align="center"><b>Who really said it?</b><br>Paste a quote you saw online. Said Who? looks for the place it first appeared and shows you the trail, with a link for every step.</p>

## Why I'm building this

Quotes travel. Every time one gets shared it can lose a word, pick up a new one, or end up with a more famous name attached. A few years later everyone "knows" who said it, and nobody can point to where.

Take *"Insanity is doing the same thing over and over again and expecting different results."* It's usually credited to Albert Einstein, but there's no evidence he ever said it. The earliest match [Quote Investigator](https://quoteinvestigator.com/2017/03/23/same/) found is a 1981 newspaper report on an Al-Anon meeting in Knoxville, Tennessee.

Ask a chatbot where a quote comes from and you'll get a confident answer, and sometimes a source that doesn't exist. Said Who? is meant to work differently. Instead of guessing, it will read the actual pages, check that the quote is really there, and only then tell you what it found.

## What you'll see

This is what I'm building toward. The Status section below shows how far along it is.

1. You paste a quote.
2. A timeline fills in as sources turn up, oldest on the left.
3. Each source shows the exact sentence from its page. If the page doesn't really contain the quote, that source gets crossed out.
4. At the end you get a short verdict: the earliest source found, when the wrong name got attached, and how sure it is.

Sometimes the honest answer is "people disagree" or "I couldn't find it". Said Who? will say that rather than make something up.

## How it will work

Each quote will get a small team of AI agents, and each one has a single job:

- **Planner** thinks of other ways the quote has been worded or translated, and who might have said it.
- **Searchers** look across the web, including old books and archives.
- **Readers** open each page and note the quote, who it's credited to, the date, and what the page cites.
- **Checker** confirms the quote really appears on the page. This step is plain code, not AI, so it can't be talked into a made-up source.
- **Genealogist** follows citations backwards ("this 1995 book quotes a 1981 one") until nothing older turns up.
- **Judge** writes the verdict, and every sentence of it has to point to a source the Checker confirmed.

Small, fast models do most of the reading. When a step goes wrong, it usually gets one more try. If the Checker can't find a reader's sentence on the page, a larger model reads that page again. If a verdict points to a source the Checker didn't confirm, the largest model writes it again. A model that used up its room while thinking tries again without thinking. A rejected key or a spent budget gets no second try. Everything else stays on the cheaper models, which keeps each investigation cheap.

<details>
<summary>Models and services</summary>

| Job | Planned model or service |
|-----|---------|
| Planner, Genealogist | NVIDIA Nemotron 3 Super |
| Readers | NVIDIA Nemotron 3.5 Lightning, and Nemotron 3 Super for a page read again |
| Judge | NVIDIA Nemotron 3 Super, and Nemotron 3 Ultra when a verdict fails a check |
| Search and page reading | Tavily |
| Checker | Plain TypeScript |

The Nemotron models are served by [Nebius Token Factory](https://nebius.com/services/token-factory). The app is built with Next.js.

</details>

## Status

I'm building this for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/). Submissions close on October 30, 2026.

- [x] Project setup, with key handling and automatic checks on every change
- [x] Tried out all four Nemotron models, and checked that Tavily can read old sources like archive.org and Wikisource
- [x] A [test set](eval/) of 20 quotes whose real origins are already known
- [x] [First full investigation](https://github.com/SelcukOzbilgi/saidwho/releases/tag/v0.1.0), start to finish, from the command line
- [x] The live timeline and verdict page
- [ ] A public demo with finished example cases

Milestones are posted under [Releases](https://github.com/SelcukOzbilgi/saidwho/releases). Notes on what worked and what didn't with the tools I'm using are in [FEEDBACK.md](FEEDBACK.md).

## Trying it

Once the demo is live, anyone will be able to browse finished investigations for free. To run a new one, you'll paste in your own Nebius and Tavily keys. Your keys are used for that one run and passed only to those two services. They're never saved or written to logs.

## Running it locally

You'll need Node.js 24 and pnpm.

```bash
git clone https://github.com/SelcukOzbilgi/saidwho.git
cd saidwho
pnpm install
cp .env.example .env.local   # then add your Nebius and Tavily keys
pnpm dev
```

`pnpm test` runs the tests. `pnpm smoke:nebius` and `pnpm smoke:tavily` make a few small real calls to check that your keys work.

With `pnpm dev` running, open http://localhost:3000, paste a quote and the name it's usually credited to, and add your own keys. The page shows each agent's step as it happens, a card for every page that carries the quote (oldest first, with the ones the checker couldn't find on the page crossed out) and the verdict with links back to its evidence. The free trial option stays off unless `LIVE_RUNS_ENABLED`, `TRIAL_RUNS_ENABLED` and a `DAILY_BUDGET_USD` of at least $0.20 (what one trial run sets aside before it starts) are set, along with the server's own keys.

`pnpm investigate insanity-same-thing` runs one quote from the [test set](eval/) and prints each step, the verdict and what it cost. Any `id` from `eval/quotes.jsonl` works. In the runs so far, one investigation cost under half a cent of Nebius usage and about 5 Tavily credits; other quotes can cost more. As a safety net, the script starts no new model call once its estimated Nebius spend reaches $0.50, though calls already running still finish.

## Security

If you find a security problem, please report it privately. See [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
