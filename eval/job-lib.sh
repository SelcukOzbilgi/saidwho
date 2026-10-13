# Helpers for job.sh, sourced from the repo root. They live apart from it so they
# can be tested without a job (src/eval/job-lib.test.ts).

# Where the bucket is mounted. EVAL_OUTPUT moves it, for the tests.
output="${EVAL_OUTPUT:-/output}"

# Splits EVAL_ARGS on any run of spaces, tabs or newlines into eval_args, the
# arguments pnpm eval gets, and sets runs and results to the folder under .runs/
# and the file under eval/ of the set they name. A set it doesn't know stops the
# job before anything is restored or paid for.
parse_eval_args() {
  eval_args=()
  if [ -n "${EVAL_ARGS:-}" ]; then
    # -d '' reads past newlines; read then returns 1 at the end of the input.
    IFS=$' \t\n' read -r -d '' -a eval_args <<<"$EVAL_ARGS" || true
  fi
  local set=main i
  for ((i = 0; i < ${#eval_args[@]}; i++)); do
    case "${eval_args[i]}" in
      --set)
        set="${eval_args[i + 1]:-}"
        break
        ;;
      --set=*)
        echo "EVAL_ARGS: write --set and the set apart, as in --set holdout" >&2
        return 1
        ;;
    esac
  done
  case "$set" in
    main) runs=eval results=results.md ;;
    holdout) runs=eval-holdout results=holdout-results.md ;;
    *)
      echo "EVAL_ARGS: --set takes main or holdout, not '$set'" >&2
      return 1
      ;;
  esac
}

# A job started again, say after a timeout, picks up the runs the last one copied
# out, so the quotes already run aren't paid for twice.
restore_runs() {
  if [ ! -d "$output/$runs" ]; then return 0; fi
  mkdir -p ".runs/$runs"
  local setup
  for setup in cascade ultra lightning; do
    if [ -d "$output/$runs/$setup" ]; then cp -r "$output/$runs/$setup" ".runs/$runs/"; fi
  done
}

# Copies the set's runs and scores to the bucket, when one is mounted.
copy_out() {
  if [ ! -d "$output" ]; then return 0; fi
  mkdir -p "$output/$runs"
  if [ -f "eval/$results" ]; then cp "eval/$results" "$output/$runs/"; fi
  local setup
  for setup in cascade ultra lightning; do
    if [ -d ".runs/$runs/$setup" ]; then cp -r ".runs/$runs/$setup" "$output/$runs/"; fi
  done
  echo "Copied the runs and scores to $output/$runs"
}
