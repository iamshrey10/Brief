# Working on Brief

`main` is protected. Nothing reaches it except through a pull request whose checks have passed, so what is on `main` is always
what was tested, and what a host deploys from it is too.

## The steps

1. Start from an up to date `main` and make a short branch for one piece of work:

       git checkout main && git pull
       git checkout -b feat/short-name

2. Install the commit hook once after cloning. It refuses a commit message that credits an AI tool:

       scripts/install-hooks.sh

3. Make the change in small commits, each one a real change with its tests. Run the checks you can as you go:

       scripts/check-all.sh          # lint, tests, the quality gate and the build
       scripts/check-all.sh --e2e    # and the browser tests (needs Redis: docker compose up -d)

4. Push the branch and open a pull request into `main`. Say what changed, how it works, what was checked and what is not in it.
5. Wait for the three required checks: **api, lint and tests**, **web, lint, tests and build**, and **web, browser tests**.
6. Merge with **Rebase and merge**. Squash and merge commits are switched off, so every commit stays on `main` as it was
   written. The branch is deleted after the merge.

## Rules that are enforced

- No direct push to `main`, no force push, no deleting it, and the rule applies to the owner too.
- Linear history: no merge commits.
- Every change to behaviour comes with a test, and the backend keeps its coverage floor.
- Dependencies that are known to be weak are caught by the weekly audit. Version update pull requests are switched off.

## Reporting a security problem

Please do not open a public issue. See [SECURITY.md](SECURITY.md).
