# Security

Brief holds people's private contracts, so a security problem matters more here than a bug.

## Reporting a problem

Please do not open a public issue. Use GitHub's private reporting instead: the **Security** tab of this repository,
then **Report a vulnerability**. Say what you found, how to reproduce it, and what it lets someone do. I will reply
as soon as I can and say what I am doing about it.

Please do not test against other people's accounts or documents, and do not upload real contracts while testing.

## What is in place

The [Security section of the README](README.md#security) lists every protection and the test or check behind it:
signed tokens that expire after 60 seconds between the website and the API, ownership checks on every document,
uploads checked against what the file really is, per minute and daily limits, deletion that removes the stored
files, logs that never carry document text, and secret scanning with push protection on this repository.

Sharing a dashboard is read only and enforced by the API, not the page. An invitation is a link secret and a six digit
code, both stored only as keyed hashes. Five wrong codes end the invitation, an unapproved one stops working after
seven days, at most five people can have access, the owner approves each person and can remove access at once, and a
viewer is given the dashboard's summary and never the files or any route that changes or asks about a document.

Files are kept in the person's own part of storage, in one of five fixed folders (Lease, Education_Loan, Job_Offers,
Personal_Documents, Other). A folder is only ever one of those names, so nothing typed can build a path into someone
else's files, and moving a file copies it and checks the copy before the original goes. Files stored before folders
existed are filed with `python -m app.filing`, which can be run again safely.

Two step verification is optional and uses an authenticator app. The secret is stored encrypted, a code works once, five
wrong codes lock it for fifteen minutes, ten single use recovery codes are kept only as keyed hashes, and a person can
keep a browser remembered for thirty days (also kept only as a hash). Once it is on, the website asks the API on every
new sign in and lets nobody through when the API cannot answer.

## Known gaps

These are not done yet, and are listed so nobody has to find them:

- The browser's Content Security Policy runs in report only mode until it has been checked on the live site.
- There are no database backups or alerts yet.
- The privacy and terms pages have not been read by a lawyer.
- The site has not had a security review since going online, because it is not online yet.
