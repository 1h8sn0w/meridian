import { test } from 'node:test'
import assert from 'node:assert/strict'

import { splitBought } from './just-bought.ts'

const items = [
  { key: 'a', checked: false },
  { key: 'b', checked: true },
  { key: 'c', checked: true },
]

const split = (justBought: ReadonlySet<string>) =>
  splitBought(
    items,
    (item) => item.checked,
    (item) => item.key,
    justBought,
  )

test('позначене йде в «Куплене», непозначене лишається в списку', () => {
  const { toBuy, bought } = split(new Set())
  assert.deepEqual(
    toBuy.map((item) => item.key),
    ['a'],
  )
  assert.deepEqual(
    bought.map((item) => item.key),
    ['b', 'c'],
  )
})

test('щойно позначене лишається на своєму місці, доки малюється галочка', () => {
  const { toBuy, bought } = split(new Set(['c']))
  assert.deepEqual(
    toBuy.map((item) => item.key),
    ['a', 'c'],
  )
  assert.deepEqual(
    bought.map((item) => item.key),
    ['b'],
  )
})

test('ключ «щойно» без позначки нічого не міняє: зняту позицію не тримаємо', () => {
  const { toBuy } = split(new Set(['a']))
  assert.deepEqual(
    toBuy.map((item) => item.key),
    ['a'],
  )
})
