import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULTS, generateWeek, poolShortage } from './generator.ts'
import { MEAL_TYPES } from './types.ts'
import type { GenerateResult } from './generator.ts'
import type { Meal, WeekPlan } from './types.ts'
import {
  SEEDS,
  meal,
  mixedPool,
  prefs,
  profile,
  seeded,
  weekMealIds,
  weekViolations,
} from './test-support.ts'

function expectOk(result: GenerateResult): WeekPlan {
  if (!result.ok) throw new Error('генератор відмовив: ' + result.error)
  return result
}

test('збирає тиждень, що не порушує жодного правила (усі зерна)', () => {
  for (const seed of SEEDS) {
    const result = expectOk(
      generateWeek(mixedPool(), {
        targetCalories: 2050,
        corridor: 100,
        random: seeded(seed),
      }),
    )
    assert.equal(result.days.length, 7)
    assert.deepEqual(weekViolations(result), [], 'зерно ' + seed)
    assert.equal(result.usedCorridor, 100)
    assert.deepEqual(result.warnings, [])
  }
})

test('антиповтор тримається на всьому вікні, а не лише на сусідньому дні', () => {
  for (const seed of SEEDS) {
    const result = expectOk(
      generateWeek(mixedPool(), {
        targetCalories: 2050,
        antiRepeatDays: 4,
        random: seeded(seed),
      }),
    )
    assert.equal(result.params.antiRepeatDays, 4)
    assert.deepEqual(weekViolations(result), [], 'зерно ' + seed)
  }
})

test('антиповтор понад довжину тижня зводиться до довжини тижня', () => {
  const result = expectOk(
    generateWeek(mixedPool(), {
      targetCalories: 2050,
      days: 4,
      antiRepeatDays: 10,
      random: seeded(1),
    }),
  )
  assert.equal(result.params.antiRepeatDays, 4)
  assert.deepEqual(weekViolations(result), [])
})

test('MER-27: знаходить розклад, що існує лише при точному коридорі', () => {
  const pool: Array<Meal> = []
  for (const type of MEAL_TYPES) {
    ;[100, 200, 300].forEach((calories, i) => {
      pool.push({
        ...meal({ id: type + '-' + i, type, calories, source: 'Тиждень 1' }),
      })
    })
  }

  for (const seed of SEEDS) {
    const result = expectOk(
      generateWeek(pool, {
        targetCalories: 800,
        corridor: 1,
        days: 3,
        antiRepeatDays: 3,
        random: seeded(seed),
      }),
    )
    assert.equal(
      result.usedCorridor,
      1,
      'зерно ' + seed + ': коридор послаблено',
    )
    assert.deepEqual(weekViolations(result), [], 'зерно ' + seed)
    for (const day of result.days) assert.equal(day.calories.total, 800)
  }
})

test('MER-29: перший день не повторює страв попереднього календарного дня', () => {
  const pool = mixedPool()
  const yesterday = MEAL_TYPES.map((type) => type + '-0')
  const beforeYesterday = MEAL_TYPES.map((type) => type + '-1')

  for (const seed of SEEDS) {
    const result = expectOk(
      generateWeek(pool, {
        targetCalories: 2050,
        antiRepeatDays: 3,
        precedingDays: [yesterday, beforeYesterday],
        random: seeded(seed),
      }),
    )
    const ids = weekMealIds(result)
    for (const id of ids[0] as Array<string>) {
      assert.ok(
        !yesterday.includes(id),
        'зерно ' + seed + ': день 0 повторив «' + id + '»',
      )
      assert.ok(
        !beforeYesterday.includes(id),
        'зерно ' + seed + ': день 0 повторив «' + id + '»',
      )
    }
    for (const id of ids[1] as Array<string>) {
      assert.ok(
        !yesterday.includes(id),
        'зерно ' + seed + ': день 1 повторив «' + id + '»',
      )
    }
    assert.deepEqual(
      weekViolations(result, [yesterday, beforeYesterday]),
      [],
      'зерно ' + seed,
    )
  }
})

test('MER-30: спільний десерт «Тиждень 1–2» сам міксу не робить', () => {
  const pool: Array<Meal> = []
  for (const type of MEAL_TYPES) {
    for (let i = 0; i < 4; i++) {
      pool.push(
        meal({
          id: type + '-' + i,
          type,
          calories: (type === 'snack' ? 300 : 500) + i * 10,
          source: type === 'snack' ? 'Тиждень 1–2' : 'Тиждень 1',
        }),
      )
    }
  }

  const result = expectOk(
    generateWeek(pool, { targetCalories: 1830, random: seeded(3) }),
  )
  assert.equal(result.mixPossible, false)
  assert.equal(result.mixed, false)
  assert.ok(
    result.warnings.includes(
      'Пул не дозволяє мікс планів — усі страви покриває один план.',
    ),
    'мала бути чесна причина, а не тихий «ok»: ' +
      JSON.stringify(result.warnings),
  )
  assert.deepEqual(
    result.sources,
    ['Тиждень 1', 'Тиждень 1–2'],
    'Підписи для показу лишаються «сирими» — обидва джерела там видно.',
  )
})

test('MER-30: single-source — це релаксація з окремим попередженням', () => {
  const pool: Array<Meal> = []
  for (const type of MEAL_TYPES) {
    for (let i = 0; i < 3; i++) {
      pool.push({
        ...meal({
          id: type + '-' + i,
          type,
          calories: 500,
          source: 'Тиждень 1',
        }),
      })
    }
  }
  pool.push(
    meal({
      id: 'unreachable',
      type: 'breakfast',
      calories: 5000,
      source: 'Тиждень 2',
    }),
  )

  const result = expectOk(
    generateWeek(pool, {
      targetCalories: 2000,
      corridor: 0,
      random: seeded(5),
    }),
  )
  assert.equal(result.mixPossible, true)
  assert.equal(result.mixed, false)
  assert.equal(result.usedCorridor, 0)
  assert.ok(
    result.warnings.includes(
      'Не вдалося поєднати різні плани — тиждень зібрано зі страв одного джерела.',
    ),
    JSON.stringify(result.warnings),
  )
  assert.ok(
    !weekMealIds(result).flat().includes('unreachable'),
    'страва поза коридором не мала потрапити в тиждень',
  )
})

test('MER-30: зібраний із двох планів тиждень позначається mixed', () => {
  for (const seed of SEEDS) {
    const result = expectOk(
      generateWeek(mixedPool(), { targetCalories: 2050, random: seeded(seed) }),
    )
    assert.equal(result.mixPossible, true, 'зерно ' + seed)
    assert.equal(result.mixed, true, 'зерно ' + seed)
    assert.deepEqual(result.sources, ['Тиждень 1', 'Тиждень 2'])
  }
})

test('коридор послаблюється лише за потреби — і про це сказано вголос', () => {
  const result = expectOk(
    generateWeek(mixedPool(), {
      targetCalories: 2055,
      corridor: 0,
      random: seeded(11),
    }),
  )
  assert.equal(result.usedCorridor, 50)
  assert.ok(
    result.warnings.includes(
      'Не вдалося втриматись у ±0 ккал — коридор розширено до ±50 ккал.',
    ),
    JSON.stringify(result.warnings),
  )
  assert.deepEqual(weekViolations(result), [])
})

test('MER-38: обіцяні ±500 ккал справді пробуються перед відмовою', () => {
  const flat: Record<string, number> = {
    breakfast: 300,
    lunch: 500,
    dinner: 500,
    snack: 200,
  }
  const pool: Array<Meal> = []
  for (const type of MEAL_TYPES) {
    for (let i = 0; i < 4; i++) {
      pool.push(
        meal({
          id: type + '-' + i,
          type,
          calories: flat[type],
          source: 'Тиждень ' + (i % 2 === 0 ? 1 : 2),
        }),
      )
    }
  }

  const result = expectOk(
    generateWeek(pool, { targetCalories: 2000, random: seeded(13) }),
  )
  assert.equal(result.usedCorridor, 500)
  for (const day of result.days) assert.equal(day.calories.total, 1500)
  assert.deepEqual(weekViolations(result), [])
})

test('страва без калорійності не потрапляє в тиждень, і про це сказано', () => {
  const pool = mixedPool()
  pool.push(
    meal({ id: 'no-kcal', type: 'lunch', calories: null, source: 'Тиждень 2' }),
  )

  const result = expectOk(
    generateWeek(pool, { targetCalories: 2050, random: seeded(17) }),
  )
  assert.ok(!weekMealIds(result).flat().includes('no-kcal'))
  assert.ok(
    result.warnings.some((w) => w.startsWith('Страв без калорійності: 1.')),
    JSON.stringify(result.warnings),
  )
  for (const day of result.days) assert.equal(day.calories.unknown, 0)
})

test('MER-26: приблизність страви піднімає «≈» на всю денну суму', () => {
  const pool = mixedPool().map((m, i) =>
    i === 0 ? { ...m, caloriesApprox: true } : m,
  )
  const result = expectOk(
    generateWeek(pool, { targetCalories: 2050, random: seeded(19) }),
  )
  const withApprox = result.days.filter((day) =>
    MEAL_TYPES.some((type) => day.meals[type].caloriesApprox),
  )
  assert.ok(withApprox.length > 0, 'приблизна страва мала кудись потрапити')
  for (const day of withApprox) assert.equal(day.calories.approx, true)
})

test('MER-18: небажана страва не береться, поки без неї план збирається', () => {
  for (const seed of SEEDS) {
    const result = expectOk(
      generateWeek(mixedPool(), {
        targetCalories: 2050,
        prefs: prefs([], ['lunch-0']),
        random: seeded(seed),
      }),
    )
    assert.ok(!weekMealIds(result).flat().includes('lunch-0'), 'зерно ' + seed)
  }
})

test('MER-18: якщо без небажаної не збирається — вона лишається, але з поясненням', () => {
  const pool: Array<Meal> = []
  for (const type of MEAL_TYPES) {
    for (let i = 0; i < 3; i++) {
      pool.push(
        meal({
          id: type + '-' + i,
          type,
          calories: 500,
          source: 'Тиждень ' + (i === 0 ? 1 : 2),
        }),
      )
    }
  }

  const result = expectOk(
    generateWeek(pool, {
      targetCalories: 2000,
      corridor: 0,
      antiRepeatDays: 3,
      prefs: prefs([], ['lunch-0']),
      random: seeded(23),
    }),
  )
  assert.ok(weekMealIds(result).flat().includes('lunch-0'))
  assert.ok(
    result.warnings.some((w) =>
      w.startsWith('Без страв із позначкою «не подобається»'),
    ),
    JSON.stringify(result.warnings),
  )
})

test('MER-18: улюблені частіше потрапляють у тиждень, але не витісняють решту', () => {
  const favorite = 'breakfast-3'
  const count = (favorites: Array<string>) => {
    let seen = 0
    for (let seed = 0; seed < 40; seed++) {
      const result = generateWeek(mixedPool(), {
        targetCalories: 2050,
        prefs: prefs(favorites),
        random: seeded(seed),
      })
      if (!result.ok) continue
      seen += weekMealIds(result)
        .flat()
        .filter((id) => id === favorite).length
    }
    return seen
  }

  const neutral = count([])
  const weighted = count([favorite])
  assert.ok(
    weighted > neutral,
    'улюблена мала з’являтися частіше: ' + weighted + ' проти ' + neutral,
  )
  assert.ok(
    weighted < 40 * 7,
    'улюблена не має витісняти інші страви з усіх слотів',
  )
})

test('MER-21: ціль і коридор беруться з профілю, явні опції мають пріоритет', () => {
  const owner = profile({ id: 'p1', targetCalories: 2050, corridor: 100 })

  const fromProfile = expectOk(
    generateWeek(mixedPool(), { profile: owner, random: seeded(29) }),
  )
  assert.equal(fromProfile.params.targetCalories, 2050)
  assert.equal(fromProfile.params.corridor, 100)

  const overridden = expectOk(
    generateWeek(mixedPool(), {
      profile: owner,
      corridor: 200,
      random: seeded(29),
    }),
  )
  assert.equal(overridden.params.targetCalories, 2050)
  assert.equal(overridden.params.corridor, 200)
})

test('MER-21: підмножина mealIds звужує пул профілю', () => {
  const allowed = MEAL_TYPES.flatMap((type) => [
    type + '-0',
    type + '-1',
    type + '-2',
  ])
  const owner = profile({ id: 'p1', targetCalories: 2050, mealIds: allowed })

  const result = expectOk(
    generateWeek(mixedPool(), { profile: owner, random: seeded(31) }),
  )
  for (const id of weekMealIds(result).flat()) {
    assert.ok(
      allowed.includes(id),
      'страва «' + id + '» поза підмножиною профілю',
    )
  }
})

test('порожній пул — відмова, а не порожній тиждень', () => {
  const result = generateWeek([], { random: seeded(37) })
  assert.equal(result.ok, false)
  assert.match(result.error, /Недостатньо страв у пулі/)
})

test('пул, якого не вистачає на вікно антиповтору — відмова з переліком', () => {
  const pool = mixedPool().filter(
    (m) => m.type !== 'dinner' || m.id === 'dinner-0',
  )
  const result = generateWeek(pool, {
    targetCalories: 2050,
    antiRepeatDays: 3,
    random: seeded(41),
  })
  assert.equal(result.ok, false)
  const error = result.error
  assert.match(error, /Недостатньо страв у пулі/)
  assert.match(error, /Вечеря — 1 \(потрібно ≥ 3\)/)
})

test('достатність пулу: на кожен тип щонайменше стільки страв, скільки днів у вікні антиповтору', () => {
  const pool = MEAL_TYPES.flatMap((type) =>
    [0, 1, 2].map((n) => meal({ id: type + n, type })),
  )
  assert.deepEqual(poolShortage(pool, 3), [])
  assert.deepEqual(
    poolShortage(
      pool.filter((m) => m.id !== 'snack0'),
      3,
    ),
    [{ type: 'snack', have: 2, need: 3 }],
  )
})

test('страва без калорійності достатності пулу не додає: генератор її не ставить', () => {
  const pool = MEAL_TYPES.flatMap((type) =>
    [0, 1, 2].map((n) =>
      meal({
        id: type + n,
        type,
        calories: type === 'lunch' && n ? null : 500,
      }),
    ),
  )
  assert.deepEqual(poolShortage(pool, 3), [{ type: 'lunch', have: 1, need: 3 }])
})

test('недосяжна ціль — відмова з названою межею коридору', () => {
  const result = generateWeek(mixedPool(), {
    targetCalories: 5000,
    random: seeded(43),
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /навіть із коридором ±500 ккал/)
})

test('недодатна ціль — відмова до будь-якого пошуку', () => {
  const result = generateWeek(mixedPool(), { targetCalories: 0 })
  assert.equal(result.ok, false)
  assert.match(result.error, /додатним числом/)
})

test('типові параметри — ті, що обіцяє документація', () => {
  assert.deepEqual(DEFAULTS, {
    targetCalories: 2000,
    corridor: 100,
    antiRepeatDays: 3,
    days: 7,
  })
})
