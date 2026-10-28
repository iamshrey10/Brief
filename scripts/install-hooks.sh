#!/usr/bin/env bash
# Installs the commit-msg hook into the repository you run it in, so a commit that credits an AI tool is refused.
set -eu
CHECK="$(cd "$(dirname "$0")" && pwd)/check-commit-messages.sh"
HOOK="$(git rev-parse --git-path hooks)/commit-msg"
printf '#!/bin/sh\nexec "%s" --message-file "$1"\n' "$CHECK" > "$HOOK"
chmod +x "$HOOK"
echo "installed $HOOK"
