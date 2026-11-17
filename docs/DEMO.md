# Recording a demo of Brief

**The video on the site** (`web/public/demo/brief-demo.mp4`, 1 minute 28 seconds, 1920 by 1080, 30 frames per second, light theme) was remade on
November 17, 2026, with a focus on why someone would use Brief, not how it is built. It plays when someone presses "Watch how it works" on the first page.
The screens are the real website running locally against the real API, a real Postgres and real Gemini calls, on made up sample documents. It covers
the problem, adding a document and asking questions with the wording shown behind each answer (including a question the document does not answer),
the document library, a short look at reminders, sharing the dashboard (an invitation, the other person asking for access, approval, and the read only
view), two-step verification with an authenticator app (turning it on, then the code check at sign in), and a closing card with the address. There is no
technology scene. Every spoken sentence is also a caption in the picture. Sharing shares the dashboard, read only, for a time the owner chooses, not
files, and the video says so.

The typing and the cursor are made by a script, the account address shown is changed to example.com, the invitation link shows briefcontracts.com, typed
codes are shown as dots, the recovery codes screen is skipped and the manual setup key is blurred. The voice is the Kokoro voice `am_fenrir` at 1.1 times
normal speed, one clip for each sentence, over a quiet ambient pad made for the video, so there is nothing to license. The same sentences are in
`brief-demo.vtt` for the video window's captions button. The script, the storyboard and the production notes are in the `03-Demo-Video` folder of the
Brief-Resources documents.

The video window (`web/components/demo-video.tsx`, `.demo-dialog` in `web/app/globals.css`) is as wide as the screen allows without the 16 by 9 picture
being taller than the screen, never stretches the picture, and keeps the page behind it from scrolling while it is open. Escape, the Close button or a
click outside it puts it away, and focus goes back to the button.

The rest of this page is the script for recording a longer demo by hand against the real services.

A short script and a screenshot list, so the demo shows what is true and nothing that is not. Use made up documents. Do not show a
real contract, a real email address other than your own, or the API's logs.

## Before recording

- [ ] Start everything as in `docs/MANUAL-TEST.md` and confirm `http://localhost:8000/health/ready` says `"ready": true`.
- [ ] A clean browser window at 1280 by 720 in dark mode, bookmarks bar hidden, and a throwaway account signed in with no documents yet. The top bar of every signed in page shows that account's email address, so never record with your own.
- [ ] A made up lease with a security deposit in two sentences, a made up education loan, and a made up job offer (the files in
      `~/Developer/brief-test-files`).
- [ ] Do one dry run first. The first read after a restart is slower, and on the free Gemini tier a long document can take a minute.

## The script (about two minutes)

| Seconds | Show | Say |
|---|---|---|
| 0 to 10 | The landing page, scrolled slowly past "What you get" and "How it works" | "Contracts are written to be skimmed. Brief explains one and shows the exact words behind every answer." |
| 10 to 30 | Upload the lease, pick Lease, watch "Reading part N of M" then Ready | "It reads the document into numbered clauses. This one is a made up lease." |
| 30 to 60 | The Overview: the key terms, then click the Security deposit's two quotes | "Every term has its quote. This deposit is split across two sentences, so it has two, and each one jumps to its clause." |
| 60 to 80 | "Before you sign": a gap with its wording, then Copy | "What the lease does not say matters most. Here is what to ask the other side." |
| 80 to 105 | Ask "What is the security deposit?" then click the source | "The answer comes with a quote that is checked against the clause word for word." |
| 105 to 120 | Ask something the lease never says | "And when the document does not say, Brief says so instead of guessing." |

Do not claim more than is true. It has been tried on made up documents and a few real leases, the scores are on small test sets,
and it is not legal advice. Say that last one out loud.

## Screenshots to take

1. Landing page, dark and light: the top of the page, and the whole page scrolled to show What you get and How it works.
2. The Dashboard home with a few documents read (counts, Coming up, Still to ask, What Brief found), and the Documents page with three documents, one of them Processing.
3. The Overview with the Security deposit card showing its two quote buttons.
4. "Before you sign" with a gap open.
5. An answer with its source highlighted in the clause.
6. "This document doesn't seem to cover that." (no guess)
7. A failure message ending in `Reference: xxxxxxxx`.
8. The phone width (390 by 844) of the Overview.
9. The architecture diagram from `docs/ARCHITECTURE.md`.
10. The Overview and Ask tabs, each selected once, on a long document.

## Do not show

The `.env` files, the terminal's server logs, the database, the API documentation at `/docs` on a live site (it is not served in
production), or any real person's contract or address, including your own email address in the top bar.
