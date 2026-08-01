import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // `PUBLIC_` — щоб імена змінних у розробці збігалися з контрактом
  // infra/.env.example, а не жили окремим словником під префіксом VITE_
  // (MER-45). У продакшні ці ж значення приходять рантаймом, із process.env.
  envPrefix: ['VITE_', 'PUBLIC_'],
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
