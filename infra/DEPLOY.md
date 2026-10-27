# Putting Brief online: a checklist

**Status: nothing is deployed yet.** This is what the code requires, collected in one place so going online is not
done from memory. Each step names the file or command that backs it. The plan for the first deploy (October 28) is in
section 1; it is a plan, not something done.

## 1. Decide first

The plan for the first deploy, chosen for the fewest moving parts rather than the lowest cost:

| Piece | Host | Note |
|---|---|---|
| Website | Vercel | Built for Next.js, so `AUTH_TRUST_HOST` is not needed there. |
| API | Render, from `api/Dockerfile` | Its free tier sleeps when idle, so the first request after a pause can take about a minute. Use the paid tier before sharing the link. |
| Postgres with pgvector | Neon | Switch the `vector` extension on in its settings before the first migration. Its free tier also pauses when idle. |
| Redis | Upstash | |
| File storage | Cloudflare R2 | Browsers upload straight to it, so it is required, and its CORS rule is step 6. |

Prices and free tier limits change, so check each host's page on the day.

- A host that runs the API container (`api/Dockerfile`) and one for the website (`web/Dockerfile`, or Vercel).
- A Postgres with the **pgvector** extension, a Redis, and the R2 bucket.
- Whether to pay for Gemini. The free tier allows 15 requests a minute and one document takes about 19 calls, so a
  few people reading at once will hit it. The per person daily limits (100 questions, 30 reads, 60 overviews) cap
  what one account can spend, but not what many accounts can.

## 2. The API

Settings come from the environment, never from the image. The full list is `api/.env.example`, and a test fails if
it drifts from what the server reads.

- `ENVIRONMENT=production`. In this mode the server **refuses to start** on the built-in secret, a secret under 32
  characters, or the development database password. The error names the setting, never its value.
- `SERVICE_JWT_SECRET`: at least 32 random characters, the same value the website has.
- `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`,
  `GEMINI_API_KEY`.

## 3. The database

1. The extension has to be allowed: the first migration runs `CREATE EXTENSION IF NOT EXISTS vector`, which some
   managed databases only allow after it is switched on in their settings.
2. Run the migrations once for each release, before the new version takes traffic:
   `docker run --rm <api image> alembic upgrade head`.
3. Check `GET /health/ready`. It answers 200 only when the database responds and is on the migration this code
   expects. A 503 with `"migrations": "different"` means the migration step was missed or is from another version.

## 4. The website

Settings are listed in `web/.env.example`, also checked by a test: `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `SERVICE_JWT_SECRET`, `BACKEND_URL`, `REDIS_URL`. Outside Vercel add `AUTH_TRUST_HOST=true`,
or the sign in routes answer 500.

## 5. Sign in with Google

- Add `<the site's address>/api/auth/callback/google` as an authorized redirect address on the OAuth client.
- **Check:** an OAuth app left in testing mode only lets the named test users sign in. Confirm in the Google Cloud
  console that it is published before inviting anyone else. This has not been checked yet.

## 6. Uploads straight to storage

Browsers send each file to R2 with a PUT, so the bucket must allow the site's address. From `api/`, look first:

    python -m scripts.set_bucket_cors https://your-site.example --dry-run

then run it again without `--dry-run`. It replaces the bucket's upload rules with one rule allowing only a PUT with
a Content-Type from the sites listed, and refuses a wildcard, a path, or plain http for a real site. List every
address on one command line, including `http://localhost:3000` if local development should keep working.

## 7. Probes and what the server exposes

- API: `GET /health` says the process is up (use it to decide whether to restart) and `GET /health/ready` says it can do
  real work (use it to decide whether to send traffic).
- Website: `GET /api/health` answers 200 only when Redis responds and 503 otherwise, with fixed words. Use it as the
  website's traffic check. The container's own health check only asks whether the server answers at all, because a restart
  would not fix Redis.
- `/docs`, `/redoc` and `/openapi.json` are not served when `ENVIRONMENT=production`.
- Set `LOG_FORMAT=json` on the API if the host collects logs: one JSON object a line with the request id, and an error named
  by its type only. Every line of one request shares the request id, which is also in the `X-Request-ID` header and in the
  `Reference` code a person is shown.
- The API's server keeps idle connections for 75 seconds (a load balancer's usual limit is 60) and lets a running request
  finish for 20 seconds when it stops. If the host's limits are different, change them together.
- The website sends a Content-Security-Policy in **report only** mode. Open the browser console on the deployed site, look for
  "Content Security Policy" reports, fix what is legitimate (the storage address in `connect-src` is the usual one), and then move
  the policy to the enforced header in `web/lib/security-headers.ts`.

## 8. The first run, in order

1. Sign in with a throwaway Google account.
2. Upload `3-sample-lease.pdf`-style made up data, never a real contract. Watch the progress line.
3. Open the Overview, ask a question, click a citation.
4. Trigger one failure on purpose and confirm the message ends with a `Reference:` code, then run
   `python -m scripts.find_request <code>` for it.
5. Delete the account and confirm the documents and the stored file are gone.

## 9. Rolling back

Keep the previous image tag. `alembic downgrade -1` undoes the newest migration. Only the newest one
(`a7d3e5b19c42`, the answer traces table) has been checked by applying it, undoing it and applying it again, so
try a downgrade on a copy of the data before relying on it for an older one. With the old image running against a newer database `/health/ready` says
`different`, so roll the database back with the image.

## 10. Not set up yet

- Database backups and a tested restore (use the host's snapshots, or `pg_dump`).
- Bucket versioning or a lifecycle rule for deleted files.
- Alerts on a failing `/health/ready` or a rising number of `failed` answer traces.
- A lawyer's read of the privacy and terms pages before real contracts are uploaded. They are written from what the code does
  and `docs/PRIVACY-REVIEW.md` lists what only the owner can confirm. Deleting an account already removes the files, documents
  and everything read from them.
