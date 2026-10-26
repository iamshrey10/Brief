# The Brief website as a container image: docker build -t brief-web web
#
# It listens on $PORT (3000 if unset). Settings come from environment variables at run time, never from
# the image: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, SERVICE_JWT_SECRET (the same value the API
# has), BACKEND_URL and REDIS_URL. Behind a proxy that sets the host, also set AUTH_TRUST_HOST=true.
FROM node:22-slim AS base
RUN npm install --global pnpm@12.4.2
WORKDIR /app

# Dependencies first, so editing the code does not reinstall them.
FROM base AS dependencies
# pnpm-workspace.yaml holds which dependencies may run build scripts, and without it the install stops.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=dependencies /app/node_modules node_modules
COPY . .
RUN pnpm build

# The final image holds only the self-contained server Next.js built, not the source or the tools.
FROM node:22-slim AS run
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Not as root: if something in the app were ever taken over, it could not change the container.
USER node
EXPOSE 3000
# Alive means the server answers at all, whatever it answers: a host's own check of /api/health decides whether to send
# traffic, because that one says 503 when Redis is down and a restart would not fix Redis.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(() => process.exit(0), () => process.exit(1))"
CMD ["sh", "-c", "PORT=${PORT:-3000} exec node server.js"]
