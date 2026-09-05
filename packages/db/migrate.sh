#!/bin/sh
# Накочування міграцій: psql по впорядкованих migrations/*.sql (MER-69).
#
# psql уже є в образі Postgres, з якого піднімається база, тож окремого образу
# з Node й міграційним рушієм стек не потребує. Журнал застосованого лежить у
# самій базі — це єдине, що рушій робив понад `psql -f`.
#
# Запуск: DATABASE_URL=… sh migrate.sh (у стеку — сервіс `migrate`).

set -eu

: "${DATABASE_URL:?потрібен рядок підключення, напр. postgresql://postgres:…@db:5432/postgres}"
cd "$(dirname "$0")/migrations"

# ON_ERROR_STOP — щоб помилка в міграції зупиняла накочування й повертала
# ненульовий код, а не пробігала далі по решті файлу.
#
# Імена файлів підставляються в SQL рядком, а не через `-v`: змінні psql
# розгортає лише в тому, що читає сам (-f, stdin), а рядок з -c іде на сервер
# як є — `:'name'` там лишається і валиться синтаксичною помилкою.
psql_() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Журнал — у власній схемі, а не в public: усе, що лежить у public, видно
# PostgREST, і службова таблиця опинилася б у API.
psql_ -c "
  CREATE SCHEMA IF NOT EXISTS migrations;
  CREATE TABLE IF NOT EXISTS migrations.applied (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
"

# Успадкована база. До MER-69 облік вів drizzle-kit у власній таблиці
# drizzle.__drizzle_migrations, дописуючи рядок на кожну застосовану міграцію в
# порядку журналу. Тож стільки, скільки там рядків, — це рівно перші N файлів
# за іменем. Переносимо їх у новий журнал і прибираємо стару схему.
#
# Без цього кроку новий журнал вирішив би, що не застосовано нічого, і накотив
# би на робочу базу 0000 і 0002 удруге — а це CREATE TRIGGER на таблицях, де
# тригери вже є: помилка й непіднятий стек.
if [ "$(psql_ -tAc "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL")" = t ]; then
  applied=$(psql_ -tAc 'SELECT count(*) FROM drizzle.__drizzle_migrations')
  echo "успадкований журнал drizzle: $applied міграцій — переношу"
  ls *.sql | head -n "$applied" | while read -r file; do
    psql_ -c "INSERT INTO migrations.applied (name) VALUES ('${file%.sql}') ON CONFLICT DO NOTHING"
  done
  psql_ -c 'DROP SCHEMA drizzle CASCADE'
fi

for file in *.sql; do
  name=${file%.sql}
  if [ -n "$(psql_ -tAc "SELECT 1 FROM migrations.applied WHERE name = '$name'")" ]; then
    continue
  fi
  echo "накочую $name"
  # Один файл — одна транзакція: невдала міграція не лишає базу наполовину
  # зміненою, а запис у журнал з'являється тільки разом із самою зміною.
  psql_ --single-transaction -f "$file" \
    -c "INSERT INTO migrations.applied (name) VALUES ('$name')"
done

echo 'міграції на місці'
