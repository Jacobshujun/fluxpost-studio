# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS verification
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV FLUXPOST_STANDALONE_BUILD=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ffmpeg git \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN node .trellis/verification/check.mjs

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @larksuite/cli@1.0.67

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p config data public/media public/generated \
  && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "server.js"]
