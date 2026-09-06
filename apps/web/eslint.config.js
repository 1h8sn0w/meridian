//  @ts-check

import base from '../../eslint.config.base.mjs'

export default [
  ...base,
  {
    // Збірки — не код репозиторію; routeTree.gen.ts генерує TanStack Router.
    ignores: [
      // public/ їде у збірку як є — це не код застосунку, і в програмі
      // TypeScript його немає (service worker MER-51).
      'public/',
      '.output/',
      '.nitro/',
      '.tanstack/',
      'src/routeTree.gen.ts',
    ],
  },
]
