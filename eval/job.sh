#!/usr/bin/env bash
# Runs the eval inside a Nebius Serverless AI job (see eval/README.md).
# The job clones the public repo, so it needs no image of its own. The keys come
# from the job's secret as NEBIUS_API_KEY and TAVILY_API_KEY. The scores are
# printed to the job's log. When a bucket is mounted at /output, each run's
# events and the scores are copied there; the search cache holds page text, so it
# stays behind.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=eval/job-lib.sh
source eval/job-lib.sh

# EVAL_ARGS passes options on to pnpm eval, such as "--setup cascade". With
# "--set holdout" the held-out set's runs and scores are kept apart from the
# main set's, here and in the bucket.
parse_eval_args

corepack enable
pnpm install --frozen-lockfile
restore_runs

# The runs that finished are paid for, so they are copied out however the job
# ends: done, failed or stopped.
trap copy_out EXIT
# In the job this shell is process 1, which ignores a stop signal it has no
# handler for, so a timeout would end it without the copy above.
trap 'exit 143' TERM

status=0
# The eval runs in the background so the TERM handler runs while it waits. The
# odd expansion keeps an empty list from tripping set -u in older bash.
pnpm eval ${eval_args[@]+"${eval_args[@]}"} &
wait $! || status=$?
if [ -f "eval/$results" ]; then cat "eval/$results"; fi
exit "$status"
