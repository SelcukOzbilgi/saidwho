# Changelog

All notable changes to Said Who? are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Releases before 1.0.0 are pre-releases. Versions 0.2.0 to 0.6.0 were tagged on 2026-10-15, after the fact; the date next to each is the day that milestone was complete on main.

## [Unreleased]

### Added
- Each example case has its own share image with its verdict, the quote, who it's usually credited to and what the run found, and a saved run's preview is titled with its quote (#46)

### Changed
- Gandhi's case was recorded again on the new Planner and now credits Arleen Lorrance's 1974 book (#44)
- Links point at saidwho.online (#47)

## [0.7.0] - 2026-10-15

### Added
- The home page opens with what Said Who? does differently, then a six-step "How it works" strip with each step's Nemotron tier or tool, the eval numbers, and how much cheaper a run was than the same calls at Nemotron 3 Ultra prices (#41)
- Gallery cards say whether the run matches the known answer, a short legend explains what each agent does, and every page has a header (#42)
- `scripts/rejudge.ts` can replay the Judge with chosen searches or hosts left out, and `pnpm eval --cache` reuses another checkout's search cache (#43)
- This changelog (#40)

### Changed
- The Planner names a likely first source with a year in one or two of its searches, and searches that only quote the saying again are dropped. On 8 test cases, each judged 5 times, right verdicts went from 18 to 27 of 40 and dates from 16 to 22 of 40 (#43)
- The earliest trace names its source when the Judge left the author blank, from a confirmed page that carries that year (#42)
- Links and buttons are at least 24 px tall on phones (#42)

## [0.6.0] - 2026-10-15

### Added
- A second judge looks again when a misattributed verdict rests on a page worded unlike the saying that doesn't credit the usual name (#38)
- `scripts/rejudge.ts` can compare with and without that check, and repeat page readings over several samples (#38, #39)
- Hand-drawn illustrations between the README sections (#36)

### Changed
- The Reader's cited source is the work the page says the snippet's own sentence first appeared in, never one it names for another passage (#39)
- The feedback log notes that the Toloka human check was dropped (#37)

## [0.5.0] - 2026-10-14

### Added
- When the run log is set up, a run that got as far as planning is saved when it ends and gets a public page at `/runs/<id>`. Keys and page text are never saved (#19)
- Run limits per visitor, and a trial budget shared by every server instance through the database (#27)
- `TRIAL_ACCESS_CODE`, which makes a trial run need an access code; a `#code=` link fills it in (#30)

### Changed
- The home page opens on a finished case, then the other cases, then the form (#33)
- README and eval results report the third eval run: 13 of 20 on the test set and 10 of 10 on the held-out set (#35)

## [0.4.0] - 2026-10-14

### Added
- The eval harness, `pnpm eval`: runs the test set with the app's mix of models, all on Ultra and all on Lightning, and scores each run (#22)
- The first full eval results, and the example cases recorded again from that run (#26)
- A held-out set of ten quotes, and the commit each eval run ran on (#32)
- `scripts/rejudge.ts` and `pnpm eval --replay-plan` for measuring on saved runs (#34)
- Share previews, a sitemap, `robots.txt` and a 404 page (#25)

### Changed
- The Judge's ids are tidied and checked, the labels are defined in the prompt, and the earliest date is tied to a confirmed page (#28)
- Search queries are checked in code, and the Checker tests that a snippet is the saying and where its date sits (#29)
- The Judge hears about a cited work only when the run read its text, and a second judge looks again when the earliest page cites an older dated source (#34)
- The planner runs on Nemotron 3 Ultra (#34)
- The case view: readable verdict text, model names, an "Under way" card, and a timeline that stacks its years (#31)
- Local agent notes and settings are kept out of git (#24)

### Fixed
- Dates that aren't publication dates, such as lifespans, short ranges and other calendars, are dropped (#34)
- Rough edges for first-time visitors: missing focus rings, low-contrast text, no reason shown for a disabled run button (#25)

## [0.3.0] - 2026-10-12

### Added
- The Genealogist, which searches digital libraries for the older works that pages cite (#17)
- The lineage strip, showing how the quote got to the version people share (#20)
- The Judge is told when a cited work turned up without the saying (#23)
- The cost line compares the run's cost with the same calls at Ultra prices (#18)

### Fixed
- Stray brackets and quotation marks around the planner's wordings (#21)

## [0.2.0] - 2026-10-10

### Added
- An orchestrator that reports an event for every step, with a stop signal and a spend cap (#6)
- `POST /api/investigate`, which streams a run to the browser on your own keys or on trial keys (#8)
- One more try for a failed step, on a bigger model or with thinking off (#9)
- The live timeline and verdict page (#10)
- Ten finished example cases with replays and the known answer (#11)

### Changed
- The usual credit is optional; the planner names it when it's blank (#14)
- Docs brought in line with the app, with the live demo linked (#7, #15)

### Fixed
- Trial offered when the budget couldn't cover a run, evidence links lost inside bold or italic text, and the progress bar pulsing with reduced motion on (#12)
- `pnpm install` failing outside a git repo (#13)

## [0.1.0] - 2026-10-07

### Added
- The app's base: settings checked at startup, Nebius and Tavily clients that use only the keys passed to them, and CI with secret scanning
- README for a general audience and SECURITY.md (#1)
- Security headers, including a Content Security Policy (#2)
- The eval set of 20 quotes with known origins (#3)
- `pnpm investigate <case-id>`, the first end-to-end investigation (#5)

[Unreleased]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/SelcukOzbilgi/saidwho/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/SelcukOzbilgi/saidwho/releases/tag/v0.1.0
