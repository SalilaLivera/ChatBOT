# Multi-stage: build TypeScript, then a slim, non-root runtime with only
# production dependencies and build output.

FROM node:22-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

# The migration runner (dist/db/migrate.js) resolves its SQL files at
# ../../migrations relative to itself, i.e. /app/migrations. Without this the
# runner starts, finds no *.sql, and applies nothing — silently. Copied into
# the runtime stage so migrations can be applied from inside Railway's private
# network (`node dist/db/migrate.js`), which is the only place the database is
# reachable. Plain .sql text; no build step, no dev dependency (tsx is
# devDependencies-only and absent from this stage by design).
COPY migrations ./migrations

RUN groupadd --system app && useradd --system --gid app --no-create-home app \
    && chown -R app:app /app
USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
