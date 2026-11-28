FROM supabase/postgres:17.12.0.002 AS runtime
RUN apk upgrade --no-cache
