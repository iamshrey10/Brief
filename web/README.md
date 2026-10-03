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
