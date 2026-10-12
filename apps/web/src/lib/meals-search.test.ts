import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router'

import { mealMatches, parseMealsSearch } from './meals-search.ts'

const parse = (search: string) => parseMealsSearch(defaultParseSearch(search))

test('фільтр і «Лише ГЕРХ» з адреси', () => {
  assert.deepEqual(parse('?filter=breakfast&gerd=true'), {
    filter: 'breakfast',
    gerd: true,
    q: undefined,
  })
  assert.deepEqual(parse('?filter=favorite'), {
    filter: 'favorite',
    gerd: undefined,
    q: undefined,
  })
})

test('невідоме з адреси — без фільтра', () => {
  assert.deepEqual(parse('?filter=brunch&gerd=1'), {
    filter: undefined,
    gerd: undefined,
    q: undefined,
  })
  assert.deepEqual(parse(''), {
    filter: undefined,
    gerd: undefined,
    q: undefined,
  })
})

test('запит пошуку переживає шлях через адресу без змін', () => {
  for (const q of ['гречка', 'сир ', '120', 'true', 'м’ясо з овочами']) {
    assert.equal(parse(defaultStringifySearch({ q })).q, q)
  }
})

test('пробіл у кінці запиту лишається, інакше його з’їдало б під час набору', () => {
  assert.equal(parse('?q=%D1%81%D0%B8%D1%80%20').q, 'сир ')
})

test('порожній запит чи запит із самих пробілів — без пошуку', () => {
  assert.equal(parse('?q=').q, undefined)
  assert.equal(parse('?q=%20%20').q, undefined)
})

const omelette = {
  name: 'Омлет зі шпинатом',
  ingredients: [{ name: 'Яйце', amount: 2, unit: 'шт' }, 'шпинат — жменя'],
}

const matches = (query: string) => mealMatches(omelette, query)

test('збіг за частиною назви без урахування регістру', () => {
  assert.ok(matches('омл'))
  assert.ok(matches('ОМЛЕТ'))
  assert.ok(!matches('сирники'))
})

test('збіг за назвою інгредієнта, і рядкового, і структурного', () => {
  assert.ok(matches('яйц'))
  assert.ok(matches('жменя'))
})

test('кількість структурного інгредієнта не шукається', () => {
  assert.ok(!matches('шт'))
})

test('кожне слово запиту має знайтися — у назві чи в інгредієнтах', () => {
  assert.ok(matches('омлет яйце'))
  assert.ok(matches('  шпинат   омлет '))
  assert.ok(!matches('омлет курка'))
})

test('вид апострофа не важить', () => {
  const meat = { name: "М'ясо по-домашньому", ingredients: [] }
  for (const query of ['м’ясо', 'мʼясо', "м'ясо", 'м`ясо']) {
    assert.ok(mealMatches(meat, query), query)
  }
})

test('порожній запит пропускає всі страви', () => {
  assert.ok(matches(''))
  assert.ok(matches('   '))
})
