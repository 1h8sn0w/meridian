import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Нативна оболонка для iOS/Android (MER-50). Навіщо вона, як зібрати й чого не
 * перевірено — «Нативна оболонка Capacitor» у apps/web/README.md.
 *
 * `webDir` — вивід `pnpm build:native` (Vite, `dist`). `server` свідомо не
 * заданий: із `server.url` оболонка стає вікном до чужого сайту й втрачає
 * офлайн — тобто те, заради чого її й заводили.
 */
const config: CapacitorConfig = {
  appId: 'app.meridian',
  appName: 'Меридіан',
  webDir: 'dist',
}

export default config
