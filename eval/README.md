# Test set

`quotes.jsonl` holds 20 famous quotes whose origins have already been researched. I use them to check whether Said Who? gets the right answer: `pnpm investigate <id>` runs one of them, and ten finished runs are shown as [example cases](../src/cases/) with the known answer next to the run's verdict.

Each line records:
- an `id`, the quote as people usually share it, its language, and who it's usually credited to
- the earliest known source: who wrote it, where, when, and in what words
- when the wrong name first got attached, if it's known
- a verdict: `misattributed`, `correct`, `contested` or `no_known_source`
- links to the pages the answer comes from, and a short note

Most answers come from [Quote Investigator](https://quoteinvestigator.com/). The rest come from original records, like the British parliamentary record for a Churchill speech, or from encyclopedias and academic papers. I checked each date and wording against the page itself. During test runs, Said Who? isn't allowed to search sites that have already written up the answer, such as Quote Investigator, Wikiquote and Wikipedia, or the sites each answer comes from. It has to find the trail on its own.

`pnpm eval` runs all twenty and scores each run: whether the verdict matches, and whether the earliest date it found is within two years of the known one. It runs them the way the app does, then with every step on Nemotron 3 Ultra and with every step on Nemotron 3.5 Lightning, so the results show what the mix of models costs and whether it loses anything. The scores are written to `results.md`. [results-2026-10-12.md](results-2026-10-12.md) keeps the first full run, the only one so far with all three setups. A run that a provider error spoiled isn't scored: a rejected key, no credits left, a refused request, or an outage the run didn't make up for. It runs again the next time, and the eval stops at an error every later run would hit.

Each run's log also records the commit it ran on. When `src/` had changes that weren't committed, the commit gets `-dirty-` and a short hash of those changes, so two different sets of changes on one commit show as different code. The results show it in a Code row, so a score always says which code produced it. Logs from before this show "not recorded".

Not every quote is misattributed. Six of the twenty really were said by the person they're credited to. A tool that calls every famous quote fake would fail those.

Some answers are deliberately not clean. "Gel, gel, ne olursan ol yine gel" is usually credited to Mevlana (Rumi), but scholars say nobody knows who wrote it, so the right answer there is "contested". Saying so is the honest result, not a failure.

## Held-out set

The last round of fixes came from looking at where the agent went wrong on these twenty quotes, so their scores now flatter it. `holdout.jsonl` holds ten more quotes, in the same form, that were picked after those fixes. None of them shaped the code.

Three of the ten really were said by the person they're credited to, five are misattributed, and two have no known source. One is in French and one in German. The answers come from Quote Investigator, the original texts, MIT News, the Lutherhaus Eisenach museum and encyclopedias, and each date and wording was checked against the page itself, as for the first twenty. Quote Investigator, Wikiquote, Wikipedia and the pages each answer comes from are left out of the agent's searches here too.

It's meant to be run rarely, to get a score worth reporting, not while fixing things. Once a fix comes from looking at a held-out failure, the set isn't held out anymore. To run the ten the way the app does:

```bash
pnpm eval --set holdout --setup cascade
```

Leave out `--setup` to run all three setups. Held-out runs keep their own logs in `.runs/eval-holdout/` and their own scores in `holdout-results.md`, so they never mix with the main ones, and `pnpm eval --set holdout --report` rebuilds those scores from the logs. A stopped run picks up where it left off and the spending cap applies, as for the main set, and both sets share the search cache.

To check a fix on the same searches as an earlier run, `--replay-plan <runs dir>` takes each quote's plan from that run's log instead of asking the Planner, so the first searches come from the cache. It cuts the search bill but doesn't zero it: the Genealogist still writes its own library searches from what the Readers find, and any the cache doesn't have cost Tavily credits.

`--cache <dir>` uses another search cache, such as the one in a checkout that already ran the eval, so a test in a fresh worktree pays only for searches that cache doesn't have. The directory must exist, and new searches are added to it.

## Judging saved runs again

`scripts/rejudge.ts` judges saved eval runs again without searching or fetching any page. It rebuilds each run's evidence from its log and the eval's search cache, runs only the Judge, several times per run since the Judge samples at a temperature of 0.6, and scores each verdict against the known answer. That measures a change to the Judge's prompt or checks on the same evidence. It compares variants: `main` is the prompt, checks and Checker rules of commit `603995a`, the code of the second eval, kept for comparison, and `new` is the current code. The header of the file lists the others and every option.

It makes paid Nebius calls with the `NEBIUS_API_KEY` in the env file you give it, and never spends more than `--max-usd` together ($1 by default). `--evidence` only shows how the variants' evidence differs and makes no calls. It has no `pnpm` alias yet, so run it with node:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/rejudge.ts \
  --logs .runs/eval/cascade --cache .runs/eval/search-cache --variants main,new --samples 3
```

## Running the eval on Nebius Serverless AI Jobs

The full eval takes about an hour, so it can run as a [Serverless AI job](https://docs.nebius.com/serverless/jobs/manage) instead of on a laptop. The job uses the public Node.js image, clones this repo, checks out the commit you reviewed and runs [`job.sh`](job.sh), so there's no image to build. With a commit checked out, the job runs the code you reviewed rather than whatever the default branch holds when it starts, and the scores belong to a known commit. This path hasn't been run end to end yet.

1. Install the [Nebius AI Cloud CLI](https://docs.nebius.com/cli) and log in.
2. In the Nebius console, create a secret named `saidwho-eval-keys` with two keys, `NEBIUS_API_KEY` and `TAVILY_API_KEY`, so the keys never appear in a command.
3. Optionally, create an Object Storage bucket for the runs and scores, here `saidwho-eval`.
4. Start the job. Set `COMMIT` to the full hash of the commit you reviewed, which must be on GitHub. `--env-secret` names the secret from step 2, never a key:

```bash
SECRET=saidwho-eval-keys
COMMIT=...   # the full hash of the commit you reviewed
nebius ai job create \
  --name saidwho-eval \
  --image node:24-bookworm \
  --container-command bash \
  --args "-c 'git clone https://github.com/SelcukOzbilgi/saidwho.git /work && git -C /work checkout --detach $COMMIT && bash /work/eval/job.sh'" \
  --platform cpu-d3 \
  --preset 2vcpu-8gb \
  --timeout 3h \
  --restart-policy never \
  --env-secret "NEBIUS_API_KEY=$SECRET,TAVILY_API_KEY=$SECRET" \
  --volume 's3://saidwho-eval:/output:rw:default'
```

5. Follow it with `nebius ai job logs <job ID> --follow`. The scores are printed at the end, and with the bucket mounted, each run's events are in `eval/` there. The runs that finished are copied there even when the job fails or hits its timeout, and a job started again with the same bucket picks up where the last one stopped. To start over, for example after the code changed, empty `eval/` in the bucket first.

Leave out `--volume` to get only the scores in the log. Set `--env EVAL_ARGS="--setup cascade"` to run only the app's way, or `--env EVAL_ARGS="--set holdout --setup cascade"` to run the held-out set that way. Its runs and scores go to `eval-holdout/` in the bucket, apart from the main set's. A set the job doesn't know stops it before anything runs.
