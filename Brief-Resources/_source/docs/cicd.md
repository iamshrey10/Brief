title: CI/CD Explanation
---
## Overview

CI/CD stands for continuous integration and continuous delivery (or deployment). **Continuous integration** means that every change is built and tested automatically, as soon as it is proposed, so a mistake is found while it is small. **Continuous delivery** means that a change that has passed is shipped to the live site by an automated process and not by hand. **Continuous deployment** goes one step further: every passing change goes live without a person pressing a button.

Brief has continuous integration through GitHub Actions and automatic deployment through Vercel and Render. This document describes what is actually set up, read from `.github/workflows/ci.yml`, `.github/workflows/audit.yml`, the repository's branch rules and the hosts' settings and deploy history, and it marks clearly what is **not** set up. It was written on November 17, 2026.

![wide: The CI/CD pipeline as it is set up, from a developer's change to the live site. Dashed grey boxes are recommended and not set up.](Brief-CI-CD-Pipeline.png)

## Continuous integration

### When a workflow runs

| Workflow | Triggers |
|---|---|
| **CI** (`ci.yml`) | A push to `main`, and every pull request into `main` |
| **Dependency audit** (`audit.yml`) | A push to `main`, every pull request into `main`, and every Monday at 15:00 UTC |

A pull request is the normal path: a developer works on a short branch, pushes it, and opens a pull request. The push to the branch and the pull request both start the workflows. When the change is merged, the same workflows run again on `main`.

### What happens after a developer pushes code

GitHub starts the workflow runs on its own Linux machines. Five jobs run side by side, and each starts from a clean checkout:

1. **web, lint, tests and build** (`web/`). Installs the packages from a frozen lockfile (so the versions are exactly the tested ones), runs ESLint, runs the Vitest unit tests with a coverage report, and then builds the website with `next build`. The run fails if coverage of the app's own code falls below the floor set in `vitest.config.mts` (97 percent of statements and lines, 95 percent of branches and functions). The build also checks the types.
2. **web, browser tests** (`web/`). Starts a real Redis, installs Chromium, and runs every Playwright test against the website and a fake API that checks tokens the way the real one does. The tests include accessibility scans with axe in light and dark mode and phone-width checks. If a test fails, its traces are kept as a downloadable artifact for 7 days. A test is retried once, and a test that passes only on the retry is reported as flaky.
3. **api, lint and tests** (`api/`). Starts a Postgres with pgvector, installs Tesseract, runs `ruff check`, checks that the application imports, runs `alembic upgrade head` on the empty database (so the migrations are tested), and runs the full pytest suite with a coverage floor of 99 percent. It then checks that the recorded evaluation results still meet their minimums in `evals/thresholds.json` (no model and no secret are needed), and runs `scripts/check-commit-messages.sh`, which fails if any commit message credits an AI tool.
4. **web production dependencies** (`audit.yml`). Runs `pnpm audit` and fails on a known high-severity problem in the libraries that ship to users.
5. **api dependencies** (`audit.yml`). Runs `pip-audit` on the API's requirements.

The API job uses placeholder secrets (for example `SERVICE_JWT_SECRET: ci-only-secret`) because none of the tests reaches a real service. No real secret is ever stored in the workflow files.

### Do automated tests run? Does linting run? Are builds checked?

Yes to all three. In total the latest run on November 17, 2026 (the last commit of PR #99) executed **3,576 tests**: 1,298 API tests, 1,937 website unit tests and 341 browser tests, all passing. Linting runs for both languages (ESLint and ruff). The website is built in CI, which catches type errors and broken imports, and the API is imported and its migrations applied to a fresh database.

### Checks before the push

On a developer's machine, **pre-commit hooks** (`.pre-commit-config.yaml`, installed with `scripts/install-hooks.sh`) check whitespace, YAML, large files and merge markers on each commit, and `scripts/check-all.sh` runs every check CI runs, in order.

### How failures are reported

Each job shows as a check on the pull request, green or red, with its log one click away. A failing job blocks the merge when it is one of the required checks (see the next section). A failed browser run keeps its traces. Dependabot raises vulnerability alerts on GitHub (routine update pull requests are off), and the weekly audit is the main early warning.

## Branch rules and merging

The branch rules on `main` are:

- **Three checks are required** to pass before a pull request can be merged: `api, lint and tests`, `web, lint, tests and build`, and `web, browser tests`.
- The two dependency audits and the two Vercel checks (the build and a preview-comments check) also run on every pull request, so **seven checks run in total**, but they are not required by the branch rules.
- **History must be linear**, so changes are merged by rebase. Force pushes and deleting `main` are not allowed.
- The rules apply to administrators too.
- No review approval is required, because the project has one developer.

A merged branch is deleted. Nothing reaches `main` except through a pull request whose three required checks have passed.

## Continuous delivery and deployment

### How deployment is triggered

Brief deploys automatically when `main` changes, with no manual step.

- **The website is deployed by Vercel.** Vercel is connected to the GitHub repository. A merge to `main` builds and deploys the production site, and each pull request gets its own preview build and a check on the pull request.
- **The API is deployed by Render.** Render is connected to the same repository and deploys automatically ("New commit via Auto-Deploy" in its deploy history) when the API's files change. Its history shows an automatic deploy after the merges that changed the API, starting about when CI on `main` finishes, and none for merges that changed only the website, so a website-only change does not redeploy the API. Render builds an image from `api/Dockerfile` and replaces the running container.

Hosting platforms used: Vercel (website), Render (API), Neon (database), Upstash (Redis) and Cloudflare (file storage).

### Environment variables

Settings never live in the code or the image. They are set in each host's dashboard.

- **Render** holds the API's settings: `ENVIRONMENT=production`, `DATABASE_URL`, `SERVICE_JWT_SECRET`, the R2 keys, `GEMINI_API_KEY`, the model-call limits, and `ADMIN_EMAILS`. In production the API refuses to start on a built-in secret, one shorter than 32 characters, or the development database password.
- **Vercel** holds the website's settings: `AUTH_SECRET`, the Google client id and secret, `SERVICE_JWT_SECRET` (the same value as the API's), `BACKEND_URL`, `REDIS_URL`, and `NEXT_PUBLIC_GA_ID`. The last one is public by design (the Analytics id is visible in any page that uses it), so it is stored as a plain configuration value, while the others are stored as secrets. A value that starts with `NEXT_PUBLIC_` is built into the page, so changing it needs a redeploy.
- `api/.env.example` and `web/.env.example` list every setting without values, and a test fails if they drift from what the code reads.

### What happens during a deployment

1. A change merges into `main`. CI runs again on `main`.
2. Vercel builds the website and, when the build succeeds, switches the live site to it.
3. Render builds the API image and replaces the running container. If a health check path is set on the service, Render waits for the new container to pass it before sending traffic to it; `infra/DEPLOY.md` recommends `/health/ready`, and the setting should be confirmed in Render. Database migrations are a separate step, run once per release before the new version takes traffic (`alembic upgrade head`, listed in `infra/DEPLOY.md`). The admin counters, which need a table created by a recent migration, work on the live site, which indicates the migration step has been run on deploys. Whether it is wired as Render's pre-deploy command should be confirmed in Render's settings.
4. `/health/ready` answers 200 only when the database responds and is on the migration the code expects. UptimeRobot checks the site and this address every 5 minutes.

### When a deployment fails

- If the **build fails**, the host keeps serving the previous version, and the failed deploy is visible in its history.
- If a **migration is missing**, `/health/ready` answers 503 with `"migrations": "different"`, which shows the step was missed.
- **Rolling back.** Render keeps previous deploys with a Rollback button. For the database, `alembic downgrade -1` undoes the newest migration, and `infra/DEPLOY.md` notes that only the newest has been tested by applying, undoing and applying it again, so a downgrade should be tried on a copy first. An image running against a newer database shows "different" on `/health/ready`, so the image and the database must be rolled back together.
- If the live site stops answering, UptimeRobot emails the owner within about 5 minutes.

## Implemented and recommended

| Step | Status |
|---|---|
| Pre-commit hooks and a local `check-all.sh` | Implemented |
| Lint, unit tests with a coverage floor, build, on every push and pull request | Implemented |
| Browser tests with accessibility scans, against a fake API | Implemented |
| API tests with a real Postgres, migrations applied, coverage floor | Implemented |
| Evaluation results held to minimums in CI (without calling the model) | Implemented |
| Weekly and per-push dependency audits for both languages | Implemented |
| A commit-message check against AI credits | Implemented |
| Protected `main`, three required checks, linear history, no force push | Implemented |
| Automatic deploy of the website (Vercel) and the API (Render) after a merge, and preview builds for pull requests | Implemented |
| Uptime monitoring with email alerts | Implemented (UptimeRobot) |
| Making the Vercel checks and the audits required, not just run | Recommended |
| A staging environment | Recommended, not set up |
| An automated smoke test of the live site after each deploy | Recommended, not set up |
| Automatic rollback when a health check fails | Recommended, not set up |
| Database backups and a tested restore | Recommended, not set up (listed in `infra/DEPLOY.md`) |
| Alerts on a rising number of failed answer traces | Recommended, not set up |

## "Can you walk me through your CI/CD pipeline?"

A natural answer, as it might be said aloud:

"Sure. I work on a short branch and open a pull request into `main`. As soon as I push, GitHub Actions starts. It runs three main jobs side by side on clean machines. The website job installs from a locked file, lints, runs about nineteen hundred unit tests with a coverage floor, and builds the site. The browser job starts a real Redis and runs every Playwright test in Chromium, including accessibility scans, against a fake API that checks tokens like the real one. The API job starts Postgres with the vector extension, lints with ruff, applies the migrations to an empty database, runs about thirteen hundred tests with a ninety-nine percent coverage floor, and checks that the recorded AI evaluation scores still meet their minimums. Alongside those, two dependency audits run, and they also run every Monday.

Branch protection on `main` requires those three jobs to pass, forces a linear history so I merge by rebase, and doesn't allow force pushes, even for me. When it merges, Vercel builds and deploys the website and Render builds the API's Docker image and deploys it automatically. The API has a readiness endpoint that only says 200 when the database is reachable and on the right migration, and an uptime monitor checks it and the website every five minutes and emails me if something fails.

What I haven't built yet is a staging environment, an automatic smoke test after each deploy, automatic rollback, and database backups with a tested restore. If I had another week, I would add the backups first, because that is the risk I'd least like to discover the hard way."

A shorter version, for when time is tight: "Every pull request runs the website tests, the browser tests with accessibility scans, and the API tests against a real database, plus dependency audits. Three of those must pass before it can be merged, and merging deploys the website to Vercel and the API to Render. An uptime monitor watches the result."
