#!/usr/bin/env bash
# Runs every check CI runs, in order, and stops at the first failure.
#
#   scripts/check-all.sh           the API, the website, and the quality gate
#   scripts/check-all.sh --e2e     and the browser tests too (needs Redis: docker compose up -d)
#   scripts/check-all.sh --list    only print the stages, run nothing
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

STAGES=(
  "api lint|cd $ROOT/api && .venv/bin/ruff check ."
  "api tests with coverage|cd $ROOT/api && .venv/bin/python -m pytest -q --cov"
  "quality gate|python3 $ROOT/evals/check_results.py"
  "commit messages|cd $ROOT && scripts/check-commit-messages.sh"
  "web types|cd $ROOT/web && pnpm exec tsc --noEmit"
  "web lint|cd $ROOT/web && pnpm lint"
  "web tests with coverage|cd $ROOT/web && pnpm test:coverage"
  "web build|cd $ROOT/web && pnpm build"
)
if [ "${1:-}" = "--e2e" ]; then
  STAGES+=("browser tests|cd $ROOT/web && pnpm e2e")
fi

if [ "${1:-}" = "--list" ]; then
  for stage in "${STAGES[@]}"; do echo "${stage%%|*}"; done
  exit 0
fi

for stage in "${STAGES[@]}"; do
  name="${stage%%|*}"
  started=$(date +%s)
  if bash -c "${stage#*|}" > /tmp/check-all.log 2>&1; then
    echo "ok    $name ($(( $(date +%s) - started ))s)"
  else
    echo "FAIL  $name"
    tail -25 /tmp/check-all.log
    exit 1
  fi
done
echo "all checks passed"
