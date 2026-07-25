import { defineConfig } from 'drizzle-kit'

// Схема й міграції — MER-44. Тут лише конфіг drizzle-kit, щоб працювала
// команда `pnpm db:migrate` з кореня воркспейсу.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Postgres-рядок інстансу Supabase; береться із середовища (див. infra/.env.example).
    url: process.env.DATABASE_URL ?? '',
  },
})
