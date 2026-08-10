# Одноразовий образ для міграцій схеми (packages/db).
#
# Окремо від web.Dockerfile навмисно: у прод-образі застосунку немає ні
# drizzle-kit, ні вихідників пакета `db`, і тягнути їх туди заради кроку, який
# виконується раз на розгортання, не варто. Контекст збірки — корінь
# репозиторію: pnpm-воркспейсу потрібні кореневі маніфести й лок-файл.

FROM node:22-alpine
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Спершу маніфести — шар із залежностями перевикористовується, доки вони не
# змінились. Потрібні всі, бо лок-файл описує воркспейс цілком.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
# Лише пакет db з його залежностями: drizzle-kit і драйвер pg.
RUN pnpm install --frozen-lockfile --filter "@meridian/db..."

COPY tsconfig.base.json ./
COPY packages/db packages/db

WORKDIR /app/packages/db
# DATABASE_URL збирається з секрету вже в контейнері — див. compose.yaml.
CMD ["pnpm", "drizzle-kit", "migrate"]
