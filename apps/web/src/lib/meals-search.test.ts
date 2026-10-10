import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultParseSearch } from '@tanstack/react-router'

import { parseMealsSearch } from './meals-search.ts'

const parse = (search: string) => parseMealsSearch(defaultParseSearch(search))

test('фільтр і «Лише ГЕРХ» з адреси', () => {
  assert.deepEqual(parse('?filter=breakfast&gerd=true'), {
    filter: 'breakfast',
    gerd: true,
  })
  assert.deepEqual(parse('?filter=favorite'), {
    filter: 'favorite',
    gerd: undefined,
  })
})

test('невідоме з адреси — без фільтра', () => {
  assert.deepEqual(parse('?filter=brunch&gerd=1'), {
    filter: undefined,
    gerd: undefined,
  })
  assert.deepEqual(parse(''), { filter: undefined, gerd: undefined })
})
