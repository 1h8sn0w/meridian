import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Нативна оболонка для iOS/Android (MER-50). Навіщо вона, як зібрати й чого не
 * перевірено — «Нативна оболонка Capacitor» у apps/web/README.md.
 *
 * `webDir` — `.output/public`; `index.html` туди кладе лише `pnpm build:native`.
 * `server` свідомо не заданий: із `server.url` оболонка стає вікном до чужого
 * сайту й втрачає офлайн — тобто те, заради чого її й заводили.
 */
const config: CapacitorConfig = {
  appId: 'app.meridian',
  appName: 'Меридіан',
  webDir: '.output/public',
}

export default config
