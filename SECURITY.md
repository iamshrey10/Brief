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

## Known gaps

These are not done yet, and are listed so nobody has to find them:

- The browser's Content Security Policy runs in report only mode until it has been checked on the live site.
- There are no database backups or alerts yet.
- The privacy and terms pages have not been read by a lawyer.
- The site has not had a security review since going online, because it is not online yet.
