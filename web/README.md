# web

Frontend for Brief. Next.js, React, TypeScript, Tailwind, shadcn/ui, and Auth.js for Google sign-in.

It also acts as a thin backend-for-frontend: each request is checked against the session and a
per-user rate limit in Redis, then forwarded to the API with a short-lived signed token.

## Running locally

Needs the environment variables listed in the [root README](../README.md#running-locally), the
backend running, and Docker for Redis.

    pnpm install
    pnpm dev

Open http://localhost:3000

## Checks

    pnpm lint
    pnpm test
    pnpm build

## Unit tests and coverage

    pnpm test               # the unit and component tests
    pnpm test:coverage      # the same, and how much of the app's own code they ran

`pnpm test:coverage` fails if coverage falls below the floor in `vitest.config.mts` (97 percent of statements and lines,
95 percent of branches and functions), which is what CI runs. It measures the app's own code and leaves out the tests,
the generated shadcn Button, and three files that only wire something up (the sign in middleware, the Auth.js route and
the theme provider), because a unit test can say nothing about a one line re-export and the browser tests exercise them
for real. The floor is a little under what the tests reach today, so a drop is noticed. It is not a goal, and a line being
run is not the same as its behaviour being checked: for that I break the code on purpose and look for a test that fails,
and the browser tests check the screens as a person would see them.

## Browser tests

    pnpm exec playwright install chromium   # once
    pnpm e2e

These run a real browser against the site on port 3100, one test at a time (88 tests, a little over a minute). They
cover the pages anyone can reach (the landing page, being turned away from the dashboard and the data routes,
the light and dark mode button, the phone layout) and, signed in, the dashboard (listing, delete with confirm,
cancel and Escape), the document page (clauses, a key term with two numbered quote buttons, a gap with wording
to ask the other side, request ids), asking (an answer, a failed question with a reference code that matches the
request id the API was sent, an empty question), uploading (a file sent to a fake storage that enforces the same
browser rules as the real bucket, a wrong kind of file, the document limit, the daily limit, a storage failure),
renaming and changing the kind, Read again and Try again, signing out, deleting the account, how many questions are
left today and what happens at none, a failing Overview section recovering with Try again, the page for a document
that failed, is still being read, is a hard to read scan, has no text or cannot be loaded, where keyboard focus lands
and returns, the same screens at phone width, and an automatic
accessibility scan (axe) of the landing page, the dashboard, the Overview and the Ask tab in both color modes, and
again with something open or showing: an answer, a failed question, the edit form, the delete confirmations, an
upload refusal and a failed document. The fake API checks the token's signature, algorithm and expiry like the real
one, so every signed in test also proves the website sends a valid token.

Real Google sign in cannot be automated, so signed in tests use a sign in that exists only when `E2E_AUTH=true`
and the server is not in production (`lib/e2e-auth.ts`, which a test checks, so `next start` and every real host
never have it), and a fake API (`e2e/support/fake-api.mjs`) that answers with made up documents, refuses a call
with no token, and remembers deletes. Each test signs in as its own address on the reserved domain
`example.invalid`, so each gets its own rate limit counter, which uses a real Redis (`docker compose up -d`).
The server is started for you with stand-in secrets and never reaches Google, the real API or a model.

### Going through the browser tests yourself

Start Redis once (`docker compose up -d` from the repository root). The tests start the website and the fake API
for you, so nothing else needs to be running, and they never touch your real data or your real sign in.

    pnpm e2e:ui        # Playwright's own window: pick a test, watch it run, step back and forth through it
    pnpm e2e:headed    # runs them all with a visible browser, one test at a time
    pnpm e2e           # runs them all quietly, which is what CI does
    pnpm e2e:report    # opens the report of the last run, with a trace of any test that failed

To run just the tests whose name contains a word: `pnpm e2e -g "delete"`. To run one file:
`pnpm e2e e2e/upload.spec.ts`. The tests are in `web/e2e/`, one file for each part of the app, and the fake API is
`web/e2e/support/fake-api.mjs`. If the browser is missing (it can vanish after a Playwright update), run
`pnpm exec playwright install chromium`. Playwright keeps a trace for a failed test in `web/test-results/`.

What this does not prove: the fake API is not the real one, so these tests show the website behaves correctly
given those answers, not that the real API gives them (the API's own tests do that). The accessibility scan only
finds what a machine can detect, which is only part of the problems, so a person should still check the screens
with a keyboard and a screen reader. In CI the same tests run as their own job, with a Redis, and keep their
traces when one fails.
