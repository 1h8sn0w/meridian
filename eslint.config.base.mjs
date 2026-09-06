//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

/**
 * Спільна база ESLint для всіх пакетів воркспейсу (MER-71).
 *
 * Конфіг у кожному пакеті свій — так вимагає flat config, який шукає
 * `eslint.config.js` поруч із кодом, — але сам набір правил один. До MER-71
 * той самий блок із шести вимкнених правил лежав у трьох файлах і розходився
 * б мовчки: правило, вимкнене в одному пакеті й забуте в іншому, дає різний
 * лінт на однаковому коді.
 *
 * Пакетам лишається тільки їхнє власне: список `ignores` того, що вони
 * генерують. `dist/` і сам конфіг ігноруються скрізь, тож вони теж тут.
 */
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
    ignores: ['dist/', 'eslint.config.js'],
  },
]
