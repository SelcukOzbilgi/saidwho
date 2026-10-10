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
# EVAL_ARGS passes options on, such as "--setup cascade".
# shellcheck disable=SC2086
pnpm eval ${EVAL_ARGS:-}
cat eval/results.md

if [ -d /output ]; then
  mkdir -p /output/eval
  cp eval/results.md /output/eval/
  for setup in cascade ultra lightning; do
    if [ -d ".runs/eval/$setup" ]; then cp -r ".runs/eval/$setup" /output/eval/; fi
  done
  echo "Copied the runs and scores to /output/eval"
fi
