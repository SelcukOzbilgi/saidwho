# Said Who?

Paste a viral quote and watch a team of agents trace it back to the earliest source they can verify.

Chatbots *guess* where a quote comes from. Said Who? *finds* the source: it searches the web, reads every candidate page, checks that each snippet really appears on that page, follows citations backwards, and then writes a verdict that cites its evidence. "Contested" and "inconclusive" are valid answers.

> 🚧 Work in progress for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/).

## How it works

| Step | Agent | Model |
|------|-------|-------|
| 1 | Planner: quote variants, translations, candidate authors | Nemotron 3 Super |
| 2 | Scouts: parallel web search | Tavily |
| 3 | Readers: extract snippet, attribution, date and citations from each page | Nemotron 3.5 Lightning |
| 4 | Verifier: checks every snippet against the raw page text | Plain code, no model |
| 5 | Genealogist: follows citations backwards and builds the tree | Nemotron 3 Super |
| 6 | Judge: writes a verdict where every sentence cites verified evidence | Nemotron 3 Ultra |

All models run on [Nebius Token Factory](https://nebius.com/services/token-factory).

## Status

Early setup. See the commit history for progress.

## License

[Apache-2.0](LICENSE)
