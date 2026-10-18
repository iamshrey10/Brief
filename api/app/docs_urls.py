def docs_urls(environment: str) -> dict[str, str | None]:
    """Where the interactive documentation is served, if anywhere.

    It is useful while building and a free map of every route on a live server, so production serves none
    of it. The same information is in the README."""
    if environment == "production":
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
