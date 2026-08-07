/**
 * Юніт-тести генератора тижня (MER-47, критерій приймання задачі).
 *
 * Перевіряються чотири правила дієтолога й ті межові випадки, на які вже
 * наступали у V1 — MER-26, MER-27, MER-29, MER-30, MER-18, MER-38. Кожен
 * прогін детермінований: `random` підмінено сіяним PRNG, і головні тести
 * повторюються на кількох зернах, щоб не проходити випадково.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULTS, generateWeek } from './generator.ts'
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

/** Успішний результат або зрозумілий провал тесту замість `as`. */
function expectOk(result: GenerateResult): WeekPlan {
  if (!result.ok) throw new Error('генератор відмовив: ' + result.error)
  return result
}

/* ==========================================================================
 * Правила 1–3: тип слота, коридор дня, антиповтор
 * ======================================================================== */

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

/* ==========================================================================
 * MER-27 — обмежене бектрекування на рівні тижня
 * ======================================================================== */

test('MER-27: знаходить розклад, що існує лише при точному коридорі', () => {
  /* Три дні, антиповтор 3 (жодних повторів узагалі), по три страви кожного
   * типу — тобто кожен тип розкладається перестановкою по днях. Валідний
   * розклад із денною сумою рівно 800 ккал існує:
   *   день 0: 100+200+200+300, день 1: 200+100+300+200, день 2: 300+300+100+100.
   * Жадібний вибір дня без повернення на нього не виходив (MER-27) — тому тут
   * перевіряється не просто «зібралось», а що коридор НЕ довелося послаблювати. */
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

/* ==========================================================================
 * MER-29 — антиповтор через межу тижнів
 * ======================================================================== */

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
    // День 1 віддалений на два дні від «позавчора» — вікно 3 його ще ловить.
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

/* ==========================================================================
 * MER-30 — мікс планів структурно, а не за підписом
 * ======================================================================== */

test('MER-30: спільний десерт «Тиждень 1–2» сам міксу не робить', () => {
  /* Усі страви — з «Тиждень 1», крім перекусів «Тиждень 1–2». За старою
   * логікою підписів це виглядало б як три різні джерела й «зміксований»
   * тиждень; структурно ж «Тиждень 1» покриває весь пул. */
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
  // Підписи для показу лишаються «сирими» — обидва джерела там видно.
  assert.deepEqual(result.sources, ['Тиждень 1', 'Тиждень 1–2'])
})

test('MER-30: single-source — це релаксація з окремим попередженням', () => {
  /* Мікс можливий (у пулі є «Тиждень 2»), але єдина страва цього плану ніколи
   * не влазить у коридор — тож зібраний тиждень чесний, але не зміксований. */
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

/* ==========================================================================
 * Коридор: послаблення й межа ±500 (MER-38)
 * ======================================================================== */

test('коридор послаблюється лише за потреби — і про це сказано вголос', () => {
  /* Усі калорійності пулу кратні 10, тож рівно 2055 ккал не дає жодна
   * комбінація — найближче можливе на кроці 50. */
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
  /* Пул дає рівно 1500 ккал на день, ціль — 2000: розв'язок існує лише на
   * самому краю ±500. Кроком 50 від 100 цей край «перестрибується»
   * (100→150→…→450→525), тож без окремої фінальної спроби обіцяний ±500 не
   * перевірявся б ніколи, і генератор брехливо відмовляв би. */
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

/* ==========================================================================
 * Провенанс: калорійності немає — страва не бере участі (а не «нуль»)
 * ======================================================================== */

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
    result.warnings.some((w) => w.startsWith('Без калорійності: 1 страв(и)')),
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

/* ==========================================================================
 * MER-18 — смаки
 * ======================================================================== */

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
  /* Рівно три обіди на антиповтор 3: викинути жоден не можна, тож правила
   * дієтолога переважають смак — і генератор каже про це прямо. */
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
  /* Вага, а не «завжди перша»: інакше кожен тиждень був би той самий. Рахуємо
   * появи улюбленого сніданку на багатьох зернах проти нейтрального прогону. */
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

/* ==========================================================================
 * MER-21 — профіль як вхід генератора
 * ======================================================================== */

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

/* ==========================================================================
 * Чесні відмови
 * ======================================================================== */

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
