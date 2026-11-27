import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  STACK_NARROW,
  STACK_WIDE,
  activeFirst,
  findProfiles,
  hiddenCount,
} from './profile-stack.ts'

const family = ['Анна', 'Богдан', 'Віра', 'Гліб'].map((name, index) => ({
  id: 'p' + index,
  name,
}))

test('активний профіль іде першим, решта — у своєму порядку', () => {
  assert.deepEqual(
    activeFirst(family, 'p2').map((p) => p.name),
    ['Віра', 'Анна', 'Богдан', 'Гліб'],
  )
})

test('«+N» рахує лише те, що не влізло в стек, і не буває від’ємним', () => {
  assert.equal(hiddenCount(10, STACK_NARROW), 8)
  assert.equal(hiddenCount(10, STACK_WIDE), 7)
  assert.equal(hiddenCount(3, STACK_WIDE), 0)
  assert.equal(hiddenCount(1, STACK_NARROW), 0)
})

test('пошук профілю — за частиною імені без регістру, порожній запит — усі', () => {
  assert.deepEqual(
    findProfiles(family, '  ві ').map((p) => p.name),
    ['Віра'],
  )
  assert.equal(findProfiles(family, '').length, family.length)
  assert.equal(findProfiles(family, 'хтось').length, 0)
})
