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

FROM base AS runtime
ENV NODE_ENV=production
# Вивід nitro самодостатній — node_modules у рантайм не переносяться.
COPY --from=build /app/apps/web/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
