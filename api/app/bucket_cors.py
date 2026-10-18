import re

# https for a real site, with a real domain name and no wildcard, path or trailing slash.
_SITE = re.compile(
    r"https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?",
    re.IGNORECASE,
)
# Plain http is accepted only for this machine, so local development keeps working.
_LOCAL = re.compile(r"http://(?:localhost|127\.0\.0\.1)(?::\d{1,5})?")

# How long a browser may remember the answer, so it does not ask before every upload.
MAX_AGE_SECONDS = 3600


def build_cors_configuration(origins: list[str]) -> dict:
    """The rules that let the website's own address, and nothing else, upload a file straight to the bucket.

    A browser sends the file with a PUT to a short lived address and sets the Content-Type the address was
    made for, so those are the only method and header allowed. A wildcard or a path in an origin is refused,
    because one careless line here would let any website write to the bucket from a visitor's browser."""
    if not origins:
        raise ValueError("at least one site is needed")
    for origin in origins:
        if not (_SITE.fullmatch(origin) or _LOCAL.fullmatch(origin)):
            raise ValueError(f"not an acceptable site address: {origin!r}")
    return {
        "CORSRules": [
            {
                "AllowedOrigins": list(dict.fromkeys(origins)),
                "AllowedMethods": ["PUT"],
                "AllowedHeaders": ["Content-Type"],
                "MaxAgeSeconds": MAX_AGE_SECONDS,
            }
        ]
    }
