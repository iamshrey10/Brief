# The Brief API as a container image: docker build -t brief-api api
#
# It listens on $PORT (8000 if unset). Settings come from environment variables, never from the image:
# see .env.example. With ENVIRONMENT=production it refuses to start on a weak or built-in secret.
# Database migrations are a separate step, run once per release: docker run --rm <image> alembic upgrade head
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# tesseract reads photos of pages, and libglib is needed by the image library OpenCV uses.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so editing the code does not reinstall them.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY migrations migrations
COPY app app

# Not as root: if something in the app were ever taken over, it could not change the container.
RUN useradd --create-home --uid 10001 brief && chown -R brief /app
USER brief

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','8000'), timeout=3)"

# Idle connections are kept longer than a load balancer's usual 60 seconds, and a stopping server lets a running
# request finish (a long document read can take a while) before it exits.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 75 --timeout-graceful-shutdown 20"]
