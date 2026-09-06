import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  // `PUBLIC_` — щоб імена змінних у розробці збігалися з контрактом
  // infra/.env.example, а не жили окремим словником під власним префіксом
  // (MER-45). У продакшні ці ж значення приходять рантаймом, із process.env.
  envPrefix: ['PUBLIC_'],
  // @powersync/web несе WASM і web-workers, і попередня оптимізація Vite їх
  // ламає — це вимога офіційного прикладу (demos/example-vite у
  // powersync-ja/powersync-js), а не наш здогад. `worker.format: 'es'` — звідти
  // ж: воркери пакета зібрані як ES-модулі.
  optimizeDeps: { exclude: ['@powersync/web'] },
  worker: { format: 'es' },
  plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
