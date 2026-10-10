# Test set

`quotes.jsonl` holds 20 famous quotes whose origins have already been researched. I use them to check whether Said Who? gets the right answer: `pnpm investigate <id>` runs one of them, and ten finished runs are shown as [example cases](../src/cases/) with the known answer next to the run's verdict.

Each line records:
- an `id`, the quote as people usually share it, its language, and who it's usually credited to
- the earliest known source: who wrote it, where, when, and in what words
- when the wrong name first got attached, if it's known
- a verdict: `misattributed`, `correct`, `contested` or `no_known_source`
- links to the pages the answer comes from, and a short note

Most answers come from [Quote Investigator](https://quoteinvestigator.com/). The rest come from original records, like the British parliamentary record for a Churchill speech, or from encyclopedias and academic papers. I checked each date and wording against the page itself. During test runs, Said Who? isn't allowed to search sites that have already written up the answer, such as Quote Investigator, Wikiquote and Wikipedia, or the sites each answer comes from. It has to find the trail on its own.

`pnpm eval` runs all twenty and scores each run: whether the verdict matches, and whether the earliest date it found is within two years of the known one. It runs them the way the app does, then with every step on Nemotron 3 Ultra and with every step on Nemotron 3.5 Lightning, so the results show what the mix of models costs and whether it loses anything. The scores are written to `results.md`.

Not every quote is misattributed. Six of the twenty really were said by the person they're credited to. A tool that calls every famous quote fake would fail those.

Some answers are deliberately not clean. "Gel, gel, ne olursan ol yine gel" is usually credited to Mevlana (Rumi), but scholars say nobody knows who wrote it, so the right answer there is "contested". Saying so is the honest result, not a failure.

## Running the eval on Nebius Serverless AI Jobs

The full eval takes about an hour, so it can run as a [Serverless AI job](https://docs.nebius.com/serverless/jobs/manage) instead of on a laptop. The job uses the public Node.js image, clones this repo and runs [`job.sh`](job.sh), so there's no image to build.

1. Install the [Nebius AI Cloud CLI](https://docs.nebius.com/cli) and log in.
2. In the Nebius console, create a secret named `saidwho-eval-keys` with two keys, `NEBIUS_API_KEY` and `TAVILY_API_KEY`, so the keys never appear in a command.
3. Optionally, create an Object Storage bucket for the runs and scores, here `saidwho-eval`.
4. Start the job. `--env-secret` names the secret from step 2, never a key:

```bash
SECRET=saidwho-eval-keys
nebius ai job create \
  --name saidwho-eval \
  --image node:24-bookworm \
  --container-command bash \
  --args "-c 'git clone https://github.com/SelcukOzbilgi/saidwho.git /work && bash /work/eval/job.sh'" \
  --platform cpu-d3 \
  --preset 2vcpu-8gb \
  --timeout 3h \
  --restart-policy never \
  --env-secret "NEBIUS_API_KEY=$SECRET,TAVILY_API_KEY=$SECRET" \
  --volume 's3://saidwho-eval:/output:rw:default'
```

5. Follow it with `nebius ai job logs <job ID> --follow`. The scores are printed at the end, and with the bucket mounted, each run's events are in `eval/` there.

Leave out `--volume` to get only the scores in the log. Set `--env EVAL_ARGS="--setup cascade"` to run only the app's way.
