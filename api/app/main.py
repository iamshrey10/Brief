from fastapi import FastAPI

app = FastAPI(title="Brief API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
