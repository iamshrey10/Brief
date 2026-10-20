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

## Browser tests

    pnpm exec playwright install chromium   # once
    pnpm e2e

These run a real browser against the site on port 3100, one test at a time (40 tests, about 20 seconds). They
cover the pages anyone can reach (the landing page, being turned away from the dashboard and the data routes,
the light and dark mode button, the phone layout) and, signed in, the dashboard (listing, delete with confirm,
cancel and Escape), the document page (clauses, a key term with two numbered quote buttons, a gap with wording
to ask the other side, request ids), asking (an answer, a failed question with a reference code that matches the
request id the API was sent, an empty question), the same screens at phone width, and an automatic
accessibility scan (axe) of the landing page, the dashboard, the Overview and the Ask tab in both color modes.

Real Google sign in cannot be automated, so signed in tests use a sign in that exists only when `E2E_AUTH=true`
and the server is not in production (`lib/e2e-auth.ts`, which a test checks, so `next start` and every real host
never have it), and a fake API (`e2e/support/fake-api.mjs`) that answers with made up documents, refuses a call
with no token, and remembers deletes. Each test signs in as its own address on the reserved domain
`example.invalid`, so each gets its own rate limit counter, which uses a real Redis (`docker compose up -d`).
The server is started for you with stand-in secrets and never reaches Google, the real API or a model.

What this does not prove: the fake API is not the real one, so these tests show the website behaves correctly
given those answers, not that the real API gives them (the API's own tests do that). The accessibility scan only
finds what a machine can detect, which is only part of the problems, so a person should still check the screens
with a keyboard and a screen reader. In CI the same tests run as their own job, with a Redis, and keep their
traces when one fails.
