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

FROM caddy:2-alpine
# Пакети базового образу — до найсвіжіших у тій самій гілці Alpine, на яку
# вказує тег (MER-67): тег довго стоїть на одному знімку, а виправлення CVE
# виходять раніше, ніж базу перезбирають. Повний апгрейд, а не точковий: гілка
# прибита тегом, тож це патч-рівень, і наступну CVE бази рядок закриє сам.
RUN apk upgrade --no-cache
# Caddyfile в образ не кладеться: compose монтує infra/caddy, а без маршрутів до
# auth, rest і sync цей образ окремо однаково нічого не варт.
COPY --from=build /app/apps/web/dist /srv
