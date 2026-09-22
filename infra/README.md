# infra

Deployment configuration, added as it's needed: Dockerfiles for the web and api services, and
deploy configs for Vercel and the API host.

The local development environment (Postgres and Redis) is defined in docker-compose.yml at the
repository root, not here, so `docker compose up` works from the top of the repo without any extra
steps.
