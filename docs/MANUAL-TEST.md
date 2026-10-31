# Trying Brief yourself, step by step

The automatic tests (`pnpm test`, `pnpm e2e`, the API tests) use stand-ins for Google sign in, the real API and the
model. This is the walk through for what they cannot cover: the real sign in, the real API, the real model and your
own eyes. Use made up contracts, never a real one, and tick each line as you go. If something is wrong, write down
the page, what you did, what you saw, and the **Reference** code if the message had one.

## Start everything

    docker compose up -d                                   # from the repository root: Postgres and Redis
    cd api && .venv/bin/uvicorn app.main:app --reload      # the API, on port 8000
    cd web && pnpm dev                                     # the website, on port 3000

Open http://localhost:3000. If the API says the database is behind, run `cd api && .venv/bin/alembic upgrade head`.
`http://localhost:8000/health/ready` should say `"ready": true`, and `http://localhost:8000/docs` shows the API.

## 1. Signing in

- [ ] The landing page loads in dark mode or light mode, and the button in the corner switches it.
- [ ] **Sign in with Google** shows Google's account chooser every time, even if you are already signed in to Google.
- [ ] After signing in you land on **Your contracts** and see your address with a **Sign out** button.
- [ ] Signing out returns to the landing page. Opening http://localhost:3000/dashboard signed out sends you back to it.

## 2. Uploading and reading

- [ ] Upload a made up **lease** as a PDF. The row shows **Uploading**, then **Processing** with "Reading part N of M",
      then **Ready**, without refreshing.
- [ ] Upload a photo of a page. It reads and shows a key term or two. A blurry one says it is hard to read.
- [ ] A `.txt` file or a `.exe` renamed to `.pdf` is turned away with a plain message and nothing is added.
- [ ] A password protected PDF and a blank PDF each end as **Couldn't read** with a reason in plain words and a **Try
      again** button.

## 3. The Overview, which is what Brief is for

Open the lease.

- [ ] **Key terms** show cards with a page button each. Clicking one scrolls to the clause and highlights the words.
- [ ] **The Security deposit card has two quote buttons**, numbered "quote 1 of 2" and "quote 2 of 2" if you listen
      with a screen reader, and each one highlights its own clause. This is the check that has not been done on a real
      lease yet.
- [ ] **Before you sign** lists the questions the lease does not answer, each marked as a gap with "Ask them" wording
      and a **Copy** button that copies it.
- [ ] A term the document does not state is under "not mentioned", not given an invented value.

## 4. Asking

- [ ] Ask "What is the security deposit?". You get an answer and a **From the document** source. Clicking the source
      highlights the exact words.
- [ ] Ask something the lease never says. You get "I couldn't find this in the document", and no guess.
- [ ] An empty question cannot be sent.

## 5. When something goes wrong, and following it

- [ ] Stop the API (`Ctrl+C`), then ask a question. You get a plain message ending in `Reference: xxxxxxxx`. Start the
      API again.
- [ ] Ask a question that works. In the browser's developer tools, Network tab, open the `ask` request and read its
      **X-Request-ID** response header. Its first eight characters are the reference code for that request.
- [ ] From `api/`, run `.venv/bin/python -m scripts.find_request <those eight characters>`. It prints how the answer
      ended, how long it took, and the ids of the clauses shown and cited, and no text.
- [ ] Search the API's terminal for `[` followed by the same eight characters. Every log line of that request starts
      with it.

## 6. Looking after documents

- [ ] **Edit** renames a document and changes its kind. Both are still there after a refresh. Escape closes the form
      and saves nothing.
- [ ] **Read again** asks first, then reads again and returns to **Ready**.
- [ ] **Delete** asks first. After confirming the row is gone, and `Cancel` and Escape keep it.

## 7. Phone and keyboard

- [ ] In the browser's device toolbar, choose a phone width (390 by 844). The Dashboard, the Documents page, the Overview and the Ask tab
      have no sideways scrolling, and a long file name wraps instead of being cut off.
- [ ] With the keyboard only: Tab reaches every button, opening **Edit** puts the cursor in the Name box, and closing
      it returns to the **Edit** button.

## 8. The account, with a throwaway Google account only

- [ ] **Delete my account** needs the word `DELETE` typed, then removes everything and signs you out.
- [ ] Signing in again gives an empty dashboard. In the database, no documents of that address remain, and the stored
      files are gone.

## What this walk through still cannot cover

Nothing is deployed, so a real host, a real domain and Google sign in for people outside your own test accounts are not
covered. `infra/DEPLOY.md` lists what to do before that.
