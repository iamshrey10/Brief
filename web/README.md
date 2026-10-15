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

These run a real browser against the site on port 3100 and cover what anyone can do without signing in:
the landing page, being turned away from the dashboard and the data routes, the light and dark mode button,
and the phone layout. Real Google sign in cannot be automated, so everything behind it is covered by the
component tests (`pnpm test`). The server is started for you with stand-in secrets and never reaches Google
or the API. In CI the same tests run as their own job and keep their traces when one fails.
