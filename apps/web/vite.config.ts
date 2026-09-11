import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // `PUBLIC_` — щоб імена змінних у розробці збігалися з контрактом
  // infra/.env.example, а не жили окремим словником під власним префіксом
  // (MER-45). Запікаються вони лише туди, де шаблон конфігу в index.html ніхто
  // не заповнює: `pnpm dev` і нативна збірка (src/lib/public-env.ts).
  envPrefix: ['PUBLIC_'],
  // @powersync/web несе WASM і web-workers, і попередня оптимізація Vite їх
  // ламає — це вимога офіційного прикладу (demos/example-vite у
  // powersync-ja/powersync-js), а не наш здогад. `worker.format: 'es'` — звідти
  // ж: воркери пакета зібрані як ES-модулі.
  optimizeDeps: { exclude: ['@powersync/web'] },
  worker: { format: 'es' },
  plugins: [
    devtools(),
    // Роутер — до плагіна React: він генерує src/routeTree.gen.ts і розрізає
    // файли маршрутів на окремі чанки, які вантажаться при переході.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    viteReact(),
  ],
})
