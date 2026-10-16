FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @meridian/web build

FROM golang:1.26-alpine AS caddy-build
ENV CGO_ENABLED=0
WORKDIR /build
COPY infra/caddy-build/main.go .
RUN apk add --no-cache libcap \
    && go mod init meridian/caddy \
    && go get github.com/caddyserver/caddy/v2@v2.11.7 golang.org/x/net@v0.61.0 \
    && go mod tidy \
    && go build -trimpath -tags nobadger,nomysql,nopgx -ldflags '-s -w' -o /out/caddy . \
    && setcap cap_net_bind_service=+ep /out/caddy

FROM alpine:3.23 AS runtime
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates mailcap \
    && mkdir -p /config/caddy /data/caddy \
    && chmod 1777 /config/caddy /data/caddy
COPY --from=caddy-build /out/caddy /usr/bin/caddy
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
EXPOSE 80 443 443/udp 2019
WORKDIR /srv
COPY --from=build /app/apps/web/dist /srv
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
