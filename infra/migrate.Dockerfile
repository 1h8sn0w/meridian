# Одноразовий образ для міграцій схеми (packages/db).
#
# Окремо від web.Dockerfile навмисно: у прод-образі застосунку немає ні
# drizzle-kit, ні вихідників пакета `db`, і тягнути їх туди заради кроку, який
# виконується раз на розгортання, не варто. Контекст збірки — корінь
# репозиторію: pnpm-воркспейсу потрібні кореневі маніфести й лок-файл.

FROM node:22-alpine
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# npm тут не потрібен ні на збірці, ні в рантаймі: pnpm приходить від corepack
# (окремий пакет із власним завантажувачем і власними шимами), а `drizzle-kit
# migrate` — уже від pnpm. Тож вшитий у базу npm CLI прибираємо так само, як у
# web.Dockerfile (MER-60): це рівно ті самі 16 CVE базового образу.
#
# До нуля цей образ, на відміну від web, НЕ доходить — і не може: дерево
# drizzle-kit тягне три вендорені бінарники esbuild, а Docker Scout бачить
# усередині них Go stdlib 1.20.7 / 1.23.12 з власними Critical/High. Прибрати
# їх, не прибравши drizzle-kit, неможливо. Приймаємо свідомо: образ не
# публікується на Docker Hub, збирається локально й живе секунди на
# розгортанні, а мережу назовні не слухає взагалі.
RUN corepack enable && rm -rf /usr/local/lib/node_modules/npm \
                              /usr/local/bin/npm /usr/local/bin/npx
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
