# What to confirm before the privacy and terms pages go live

The pages at `/privacy` and `/terms` say only what the code does, and a test checks the main statements. These points are
about things outside the code, which only the owner can confirm. They are not legal advice, and a lawyer should read the pages
before real people upload real contracts.

- [ ] **Google's terms for the Gemini API.** The privacy page says the text of clauses and questions go to Google's Gemini
      service and that Google's own terms govern what it does with that. Read the current terms for the plan in use, and
      whether data sent on a free plan is treated differently from a paid plan, and say so on the page if it is.
- [ ] **Where files are stored.** The page says storage is provided by Cloudflare. Confirm the bucket's region and whether it
      keeps deleted objects (versioning, lifecycle rules) longer than the page implies.
- [ ] **Backups.** Once the database is hosted, say how long backups keep a deleted account's rows. Today the page says deleting
      an account removes everything, which is true of the live data.
- [ ] **Sign in.** Confirm which fields Google shares on sign in (the page says only the email address is kept).
- [ ] **A way to reach you.** The page points to GitHub issues. Add an email address if you want one.
- [ ] **The 30 days.** `TRACES_KEPT_FOR` in `api/app/housekeeping.py` is 30 days and the page says up to 30 days. Change both
      together.
- [ ] **Who the terms are with.** They say Brief is a personal project. Change that if it becomes a company.
- [ ] **Where you and your users live.** Some places require specific wording or a cookie notice. There are no tracking cookies
      today, which is the simple case. Check if that changes, for example if analytics are added.
