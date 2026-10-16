import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

import { NO_NUTRITION } from '@meridian/core'
import type { Meal } from '@meridian/core'
import type { Db } from './mutations.ts'

export function sqliteDb(schema: string) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  const args = (params: ReadonlyArray<unknown> = []) =>
    params as Array<SQLInputValue>
  const tx = {
    execute: async (sql: string, params?: ReadonlyArray<unknown>) =>
      sqlite.prepare(sql).run(...args(params)),
    getAll: async (sql: string, params?: ReadonlyArray<unknown>) =>
      sqlite.prepare(sql).all(...args(params)),
    getOptional: async (sql: string, params?: ReadonlyArray<unknown>) =>
      sqlite.prepare(sql).get(...args(params)) ?? null,
  }
  const db = {
    ...tx,
    writeTransaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as Db
  return { sqlite, db }
}

export const testMeal = (
  id: string,
  type: Meal['type'],
  calories: number,
): Meal => ({
  id,
  name: id,
  type,
  calories,
  caloriesApprox: false,
  protein: null,
  fat: null,
  carbs: null,
  nutrition: {
    Ч: { ...NO_NUTRITION, calories },
    Ж: { ...NO_NUTRITION },
  },
  ingredients: [],
  source: '',
  portions: [],
  gerd: false,
  sourceIssues: [],
})
