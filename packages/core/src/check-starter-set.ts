/**
 * Перевірка файлу стартового набору (MER-77) до того, як його покласти на
 * сервер: `pnpm starter:check <шлях до файлу>`.
 *
 * Та сама перевірка, що в застосунку перед засівом (`parseStarterSet`), — лише
 * помилки видно одразу, а не на екрані «Страви» після розгортання. Окремий
 * модуль, бо тільки він знає про файлову систему; сам домен про Node не знає.
 */

import { readFileSync } from 'node:fs'
import { parseStarterSet } from './starter-set.ts'

const path = process.argv[2]
if (!path) {
  console.error('Використання: pnpm starter:check <файл.json>')
  process.exit(2)
}

let json: unknown
try {
  json = JSON.parse(readFileSync(path, 'utf8'))
} catch (cause) {
  console.error('Не вдалося прочитати JSON: ' + String(cause))
  process.exit(1)
}

const parsed = parseStarterSet(json)
if (!parsed.ok) {
  console.error(parsed.error)
  process.exit(1)
}
const recipes = parsed.set.meals.filter((meal) => meal.recipe).length
console.log(
  'Гаразд. Страв: ' +
    parsed.set.meals.length +
    ', з рецептом: ' +
    recipes +
    '.',
)
