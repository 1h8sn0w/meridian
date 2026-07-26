import { defineConfig } from 'drizzle-kit'

// Конфіг drizzle-kit: `pnpm db:migrate` з кореня воркспейсу застосовує
// міграції з ./drizzle, `generate` створює нові за ./src/schema.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Postgres-рядок інстансу Supabase; береться із середовища (див. infra/.env.example).
    url: process.env.DATABASE_URL ?? '',
  },
  // Ролі Supabase (`authenticated`, `anon`, `service_role`) заводить сам
  // Supabase — drizzle-kit не має ні створювати їх, ні видаляти, лише
  // посилатися на них у політиках RLS.
  entities: {
    roles: { provider: 'supabase' },
  },
})
