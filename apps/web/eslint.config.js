//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // Збірки — не код репозиторію; routeTree.gen.ts генерує TanStack Router.
    ignores: [
      // public/ їде у збірку як є — це не код застосунку, і в програмі
      // TypeScript його немає (service worker MER-51).
      'public/',
      '.output/',
      '.nitro/',
      '.tanstack/',
      'dist/',
      'src/routeTree.gen.ts',
      'eslint.config.js',
    ],
  },
]
