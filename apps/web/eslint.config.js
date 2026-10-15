//  @ts-check

import base from '../../eslint.config.base.mjs'

export default [
  ...base,
  {
    files: ['public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      parserOptions: {
        project: './tsconfig.sw.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      'public/*',
      '!public/sw.js',
      'android/',
      'ios/',
      'dist/',
      '.tanstack/',
      'src/routeTree.gen.ts',
    ],
  },
]
