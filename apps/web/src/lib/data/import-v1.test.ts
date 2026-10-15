import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { MigratedProfile } from '@meridian/core'
import { inWriteOrder } from './import-v1.ts'

const profile = (
  id: string,
  sharedPlanWith: string | null = null,
): MigratedProfile => ({
  id,
  name: id,
  targetCalories: 1800,
  corridor: 100,
  portion: null,
  mealIds: null,
  sharedPlanWith,
  goalProtein: null,
  goalFat: null,
  goalCarbs: null,
  color: '#4f9dff',
})

const ids = (profiles: Array<MigratedProfile>) => profiles.map((p) => p.id)

test('власник спільного плану записується раніше за профіль, що його ділить', () => {
  assert.deepEqual(ids(inWriteOrder([profile('b', 'a'), profile('a')])), [
    'a',
    'b',
  ])
})

test('ланцюжок спільних планів із відредагованого дампа йде від кінця до початку', () => {
  assert.deepEqual(
    ids(inWriteOrder([profile('b', 'a'), profile('a', 'c'), profile('c')])),
    ['c', 'a', 'b'],
  )
})

test('цикл посилань не губить профілів: вони йдуть у кінці як є', () => {
  assert.deepEqual(
    ids(inWriteOrder([profile('solo'), profile('x', 'y'), profile('y', 'x')])),
    ['solo', 'x', 'y'],
  )
})
