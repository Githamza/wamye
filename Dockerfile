FROM node:22-alpine AS deps
WORKDIR /app
# node:22-alpine ships npm 10, which resolves this lockfile's transitive deps
# differently than the npm 11 that wrote it and fails `npm ci`.
RUN npm i -g npm@11
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it has to be
# a build arg — a runtime env var would never reach the browser. Safe here only
# because this flag is non-secret; the Fleetbase key stays runtime-only.
ARG NEXT_PUBLIC_ALWAYS_OPEN
ENV NEXT_PUBLIC_ALWAYS_OPEN=$NEXT_PUBLIC_ALWAYS_OPEN
# Same reason: the Maps browser key must exist at build time or it inlines as
# `undefined` and the map silently stays mocked in production. Public by design
# (referrer-restricted in Google Cloud) — unlike GOOGLE_MAPS_SERVER_KEY, which
# is a runtime-only secret and must never be a build arg.
ARG NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
ARG NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
ENV NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=$NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# server.js is the standalone entrypoint; public/ and .next/static are not
# copied into it by the build, so bring them over explicitly.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
