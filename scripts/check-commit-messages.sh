#!/usr/bin/env bash
# Fails when a commit message credits an AI tool, so nothing like it reaches the public history.
#
#   scripts/check-commit-messages.sh                       every commit reachable from HEAD
#   scripts/check-commit-messages.sh --message-file FILE   one message, as the commit-msg hook gives it
set -u

PATTERN='^(co-authored-by:.*(claude|anthropic|copilot|chatgpt|openai|gemini)|.*generated with .*(claude|copilot|chatgpt))'

if [ "${1:-}" = "--message-file" ]; then
  if grep -qiE "$PATTERN" "$2"; then
    echo "commit refused: the message credits an AI tool. Remove that line and commit again." >&2
    exit 1
  fi
  exit 0
fi

found=0
for sha in $(git rev-list HEAD); do
  if git log -1 --format=%B "$sha" | grep -qiE "$PATTERN"; then
    echo "AI credit in commit: $(git log -1 --format='%h %s' "$sha")"
    found=1
  fi
done
[ "$found" -eq 0 ] && echo "no commit message credits an AI tool"
exit "$found"
