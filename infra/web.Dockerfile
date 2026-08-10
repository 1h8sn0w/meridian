# Прод-збірка apps/web у самодостатній Node-сервер (.output/server/index.mjs).
#
# Контекст збірки — КОРІНЬ репозиторію, а не apps/web: pnpm-воркспейсу потрібні
# кореневі маніфести й лок-файл. Звідси `dockerfile: infra/web.Dockerfile` і
# `context: ..` у docker-compose.yml.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Версія pnpm береться з поля packageManager у кореневому package.json.
RUN corepack enable
WORKDIR /app

FROM base AS build
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
# Синтаксис `<пакет>...` збирає пакет РАЗОМ із його залежностями по воркспейсу
# — щойно apps/web почне залежати від @meridian/core, нічого міняти не треба.
RUN pnpm --filter "@meridian/web..." build

# Рантайм НЕ успадковує `base` (MER-60). Єдина команда тут — `node
# .output/server/index.mjs`, а вивід nitro самодостатній, тож ні pnpm, ні
# corepack, ні npm не запускаються жодного разу. Але npm CLI, вшитий у
# node:22-alpine, тягне за собою ~185 пакетів — і всі їхні CVE (на 2026-08-10
# це 1 Critical + 7 High + 8 Medium, які Docker Scout показує на публічному
# образі self-host). Це мертвий код, який ніхто не виконує, проте сканери на
# боці користувачів блокують за нього розгортання. Видаляємо менеджери
# пакетів: 16 CVE → 0, SBOM 211 пакетів → 26.
#
# Якщо колись знадобиться повернути `FROM base` — спершу поясніть, навіщо
# рантайму менеджер пакетів. Правильна відповідь майже напевно «не потрібен».
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
# Вивід nitro самодостатній — node_modules у рантайм не переносяться.
COPY --from=build /app/apps/web/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
