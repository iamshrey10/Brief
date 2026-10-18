"""Lets the website's own address upload files straight to the storage bucket, and nothing else.

Run from api/ with: python -m scripts.set_bucket_cors https://brief.example.com [more sites] [--dry-run]

Browsers send each file to a short lived address with a PUT, and a bucket refuses that from a website
unless it has been told to allow it. Run this once for each address the website is served from, and again
if the address changes. It replaces the bucket's whole set of upload rules with exactly one rule, so list
every site on one command line. Use --dry-run to see the rules first. A wildcard, a path or plain http
for a real site is refused.

Exit code 0 when done, 1 when the storage service refused, 2 when an address is not acceptable.
"""

import json
import sys

from app.bucket_cors import build_cors_configuration


def run(origins: list[str], *, bucket: str, client, dry_run: bool = False) -> tuple[int, str]:
    """Builds the rules and applies them. Returns the exit code and what to print."""
    try:
        configuration = build_cors_configuration(origins)
    except ValueError as error:
        return 2, str(error)
    shown = json.dumps(configuration, indent=2)
    if dry_run:
        return 0, f"Dry run, nothing changed. These rules would be applied to {bucket}:\n{shown}"
    try:
        client.put_bucket_cors(Bucket=bucket, CORSConfiguration=configuration)
    except Exception:
        return 1, "The storage service refused the change. Check the R2 settings in api/.env."
    return 0, f"Applied to {bucket}:\n{shown}"


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    origins = [argument for argument in argv if argument != "--dry-run"]

    from app.config import settings
    from app.storage import get_client

    client = None if dry_run else get_client()
    code, text = run(origins, bucket=settings.r2_bucket_name, client=client, dry_run=dry_run)
    print(text)
    return code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
