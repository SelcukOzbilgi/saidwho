#!/usr/bin/env bash
# Runs the eval inside a Nebius Serverless AI job (see eval/README.md).
# The job clones the public repo, so it needs no image of its own. The keys come
# from the job's secret as NEBIUS_API_KEY and TAVILY_API_KEY. The scores are
# printed to the job's log. When a bucket is mounted at /output, each run's
# events and the scores are copied there; the search cache holds page text, so it
# stays behind.
set -euo pipefail

cd "$(dirname "$0")/.."
corepack enable
pnpm install --frozen-lockfile

# A job started again, say after a timeout, picks up the runs the last one
# copied out, so the quotes already run aren't paid for twice.
if [ -d /output/eval ]; then
  mkdir -p .runs/eval
  for setup in cascade ultra lightning; do
    if [ -d "/output/eval/$setup" ]; then cp -r "/output/eval/$setup" .runs/eval/; fi
  done
fi

# The runs that finished are paid for, so they are copied out however the job
# ends: done, failed or stopped.
copy_out() {
  if [ ! -d /output ]; then return 0; fi
  mkdir -p /output/eval
  if [ -f eval/results.md ]; then cp eval/results.md /output/eval/; fi
  for setup in cascade ultra lightning; do
    if [ -d ".runs/eval/$setup" ]; then cp -r ".runs/eval/$setup" /output/eval/; fi
  done
  echo "Copied the runs and scores to /output/eval"
}
trap copy_out EXIT
# In the job this shell is process 1, which ignores a stop signal it has no
# handler for, so a timeout would end it without the copy above.
trap 'exit 143' TERM

status=0
# EVAL_ARGS passes options on, such as "--setup cascade". The eval runs in the
# background so the TERM handler runs while it waits.
# shellcheck disable=SC2086
pnpm eval ${EVAL_ARGS:-} &
wait $! || status=$?
if [ -f eval/results.md ]; then cat eval/results.md; fi
exit "$status"
