# Прод-образ застосунку: статична збірка apps/web усередині Caddy.
#
# Окремого сервера застосунку немає. Він існував лише для того, щоб віддати
# браузеру три рядки конфігу, а їх тепер вписує в index.html сам Caddy
# (директива `templates`, infra/caddy/Caddyfile). Тож образ — це вхідний
# веб-сервер стека разом із файлами застосунку, і в рантаймі немає ні Node, ні
# менеджерів пакетів: те, що MER-60 вирізав із Node-образу руками, тут не
# з'являється взагалі.
#
# Контекст збірки — КОРІНЬ репозиторію, а не apps/web: pnpm-воркспейсу потрібні
# кореневі маніфести й лок-файл. Звідси `dockerfile: infra/web.Dockerfile` і
# `context: .` у compose.yaml.

# --- Застосунок --------------------------------------------------------------
FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Версія pnpm береться з поля packageManager у кореневому package.json.
RUN corepack enable
WORKDIR /app

# Спершу лише маніфести: шар із залежностями перевикористовується, доки
# package.json і лок-файл не змінились.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
# PUBLIC_* тут свідомо не задаються: у веб-образі конфіг приходить рантаймом,
# а запечене значення перебило б хіба що порожнечу (src/lib/public-env.ts).
RUN pnpm --filter @meridian/web build

# --- Caddy, зібраний нами ----------------------------------------------------
# Офіційний `caddy:2-alpine` перезбирають рідко, і Go-модулі, вкомпільовані в
# його бінарник, відстають від виправлень CVE (stdlib, x/net). `apk upgrade`
# тут безсилий: це не пакети Alpine. Тому Caddy збирається тут свіжим
# `golang:1.26-alpine`, а `x/net` піднято понад той, що в go.mod релізу.
# Чому так і як оновлювати — infra/DECISIONS.md, «Образ застосунку».
FROM golang:1.26-alpine AS caddy-build
ENV CGO_ENABLED=0
WORKDIR /build
COPY infra/caddy-build/main.go .
RUN go mod init meridian/caddy \
    && go get github.com/caddyserver/caddy/v2@v2.11.7 \
    && go mod tidy \
    && go get golang.org/x/net@v0.60.0 \
    && go build -trimpath -ldflags '-s -w' -o /out/caddy .

# --- Рантайм -----------------------------------------------------------------
# Чистий Alpine тієї ж гілки, що й у `caddy:2-alpine`, і те з офіційного
# Dockerfile (caddyserver/caddy-docker, 2.11/alpine), на що спирається стек. Не
# `FROM caddy:2-alpine`: його бінарник лишався б у нижньому шарі, і Scout
# знаходив би в ньому CVE, хоч у рантаймі працює наш.
FROM alpine:3.23 AS runtime
# `apk upgrade` — до найсвіжіших пакетів тієї ж гілки Alpine (MER-67).
RUN --mount=type=bind,from=caddy-build,source=/out/caddy,target=/tmp/caddy \
    apk upgrade --no-cache \
    && apk add --no-cache ca-certificates libcap mailcap \
    && mkdir -p /config/caddy /data/caddy /etc/caddy /usr/share/caddy \
    && chmod 1777 /config/caddy /data/caddy \
    && install -m 755 /tmp/caddy /usr/bin/caddy \
    && setcap cap_net_bind_service=+ep /usr/bin/caddy \
    && caddy version
ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data
EXPOSE 80 443 443/udp 2019
WORKDIR /srv
# Caddyfile в образ не кладеться: compose монтує infra/caddy, а без маршрутів до
# auth, rest і sync цей образ окремо однаково нічого не варт.
COPY --from=build /app/apps/web/dist /srv
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
