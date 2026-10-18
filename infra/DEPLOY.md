# Putting Brief online: a checklist

**Status: nothing is deployed yet.** This is what the code requires, collected in one place so going online is not
done from memory. Each step names the file or command that backs it. Choosing the hosts is still open.

## 1. Decide first

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

- `GET /health` says the process is up: use it to decide whether to restart.
- `GET /health/ready` says it can do real work: use it to decide whether to send traffic.
- `/docs`, `/redoc` and `/openapi.json` are not served when `ENVIRONMENT=production`.

## 8. The first run, in order

1. Sign in with a throwaway Google account.
2. Upload `3-sample-lease.pdf`-style made up data, never a real contract. Watch the progress line.
3. Open the Overview, ask a question, click a citation.
4. Trigger one failure on purpose and confirm the message ends with a `Reference:` code, then run
   `python -m scripts.find_request <code>` for it.
5. Delete the account and confirm the documents and the stored file are gone.

## 9. Rolling back

Keep the previous image tag. `alembic downgrade -1` undoes the newest migration, and every migration so far has
been applied, undone and applied again. With the old image running against a newer database `/health/ready` says
`different`, so roll the database back with the image.

## 10. Not set up yet

- Database backups and a tested restore (use the host's snapshots, or `pg_dump`).
- Bucket versioning or a lifecycle rule for deleted files.
- Alerts on a failing `/health/ready` or a rising number of `failed` answer traces.
- A privacy note and terms for people who upload real contracts. Deleting an account already removes their files,
  documents and everything read from them.
