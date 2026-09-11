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
# Синтаксис `<пакет>...` збирає пакет РАЗОМ із його залежностями по воркспейсу.
# PUBLIC_* тут свідомо не задаються: у веб-образі конфіг приходить рантаймом,
# а запечене значення перебило б хіба що порожнечу (src/lib/public-env.ts).
RUN pnpm --filter "@meridian/web..." build

# --- Caddy, зібраний нами ----------------------------------------------------
# Офіційний `caddy:2-alpine` зібрано 24.06.2026, і Docker Scout знаходить у
# ньому 1 Critical + 13 High — усі до одної в Go-модулях, вкомпільованих у
# бінарник: `stdlib` 1.26.3 (CVE-2026-39821 та ще шість), `x/crypto` 0.52.0,
# `grpc` 1.81.0, `x/net` 0.55.0. `apk upgrade` тут безсилий — це не пакети
# Alpine, а новішого релізу Caddy не існує: 2.11.4 і є останній (червень).
#
# Тому збираємо ТОЙ САМИЙ Caddy 2.11.4 свіжим Go і з піднятими модулями.
# Версії нижче — мінімум, у якому CVE закриті, взятий із самого звіту Scout:
#   Go     >= 1.26.6   (тут 1.26-alpine, тобто 1.26.8)
#   crypto >= 0.56.0   (беремо 0.57.0)
#   net    >= 0.56.0   (беремо 0.59.0)
#   grpc   >= 1.83.1   (беремо 1.83.2)
#
# Це тимчасовий шар, і його треба прибрати, щойно upstream випустить образ зі
# свіжими модулями: перевіряти — `docker run --rm --entrypoint caddy
# caddy:2-alpine build-info`.
FROM golang:1.26-alpine AS caddy-build
# Статичний бінарник: у golang:alpine немає C-компілятора, та й musl у
# рантаймному образі свій.
ENV CGO_ENABLED=0
WORKDIR /build
COPY infra/caddy-build/main.go .
RUN go mod init meridian/caddy \
    && go get github.com/caddyserver/caddy/v2@v2.11.4 \
    && go mod tidy \
    && go get golang.org/x/crypto@v0.57.0 golang.org/x/net@v0.59.0 google.golang.org/grpc@v1.83.2 \
    && go build -trimpath -ldflags '-s -w' -o /out/caddy .

# --- Рантайм -----------------------------------------------------------------
# Базою лишається офіційний образ: із нього беруться XDG_CONFIG_HOME=/config,
# XDG_DATA_HOME=/data (там живуть сертифікати Let's Encrypt), робочий каталог
# /srv і команда за замовчуванням. Підміняється рівно бінарник.
FROM caddy:2-alpine
# Пакети базового образу — до найсвіжіших у тій самій гілці Alpine, на яку
# вказує тег (MER-67): тег довго стоїть на одному знімку, а виправлення CVE
# виходять раніше, ніж базу перезбирають.
RUN apk upgrade --no-cache
COPY --from=caddy-build /out/caddy /usr/bin/caddy
# Caddyfile в образ не кладеться: compose монтує infra/caddy, а без маршрутів до
# auth, rest і sync цей образ окремо однаково нічого не варт.
COPY --from=build /app/apps/web/dist /srv
