#!/bin/sh

set -eu

: "${DATABASE_URL:?потрібен рядок підключення, напр. postgresql://postgres:…@db:5432/postgres}"
cd "$(dirname "$0")/migrations"

psql_() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_ -c "
  CREATE SCHEMA IF NOT EXISTS migrations;
  CREATE TABLE IF NOT EXISTS migrations.applied (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
"

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
  psql_ --single-transaction -f "$file" \
    -c "INSERT INTO migrations.applied (name) VALUES ('$name')"
done

echo 'міграції на місці'

if [ -n "${STARTER_SET_PATH:-}" ]; then
  if [ -s "$STARTER_SET_PATH" ]; then
    if psql_ <<'SQL'
\set content `cat "$STARTER_SET_PATH"`
INSERT INTO starter.starter_set (id, data) VALUES (true, :'content'::jsonb)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, loaded_at = now();
SQL
    then
      echo "стартовий набір завантажено: $STARTER_SET_PATH"
    else
      echo "УВАГА: стартовий набір не завантажено ($STARTER_SET_PATH) — див. помилку вище" >&2
    fi
  else
    psql_ -c 'DELETE FROM starter.starter_set'
  fi
fi
