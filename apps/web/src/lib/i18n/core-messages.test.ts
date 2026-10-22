import { test } from 'node:test'
import assert from 'node:assert/strict'
import type {
  GenerateFailure,
  PlanFlag,
  SlotFailure,
  SwapReason,
  WeekWarning,
} from '@meridian/core'
import { de } from './de.ts'
import { en } from './en.ts'
import { pl } from './pl.ts'
import { uk } from './uk.ts'

const WARNINGS: ReadonlyArray<[WeekWarning, string]> = [
  [
    { code: 'caloriesUnknown', portion: 'Ч', count: 1 },
    'Страв без калорійності для порції Ч: 1. Вони не брали участі в доборі — коридор дня рахується лише за відомими цифрами.',
  ],
  [
    { code: 'corridorWidened', corridor: 0, used: 50 },
    'Не вдалося втриматись у ±0 ккал — коридор розширено до ±50 ккал.',
  ],
  [
    { code: 'mixBlockedByDislikes' },
    'Позначки «не подобається» звузили пул — мікс планів став неможливим.',
  ],
  [
    { code: 'mixImpossible' },
    'Пул не дозволяє мікс планів — усі страви покриває один план.',
  ],
  [
    { code: 'mixFailed' },
    'Не вдалося поєднати різні плани — тиждень зібрано зі страв одного джерела.',
  ],
  [
    { code: 'mixFailedCorridorWidened', used: 150 },
    'Коридор розширено до ±150 ккал.',
  ],
  [
    { code: 'dislikedKept' },
    'Без страв із позначкою «не подобається» тиждень не збирається — вони лишились у плані. Приберіть позначку або поповніть пул.',
  ],
]

const GENERATE_FAILURES: ReadonlyArray<[GenerateFailure, string]> = [
  [
    { code: 'invalidTarget' },
    'Цільова калорійність дня має бути додатним числом.',
  ],
  [
    {
      code: 'poolShortage',
      antiRepeatDays: 3,
      shortage: [
        { type: 'dinner', have: 1, need: 3 },
        { type: 'snack', have: 0, need: 3 },
      ],
    },
    'Недостатньо страв у пулі. Правило «не частіше, ніж раз на 3 дн.» вимагає щонайменше 3 страв кожного типу, а зараз: Вечеря — 1 (потрібно ≥ 3); Перекус — 0 (потрібно ≥ 3). Додайте страви на екрані «Страви» або зменшіть антиповтор на екрані «Сьогодні».',
  ],
  [
    { code: 'noFit', target: 5000, corridor: 500 },
    'Не вдалося зібрати тиждень під 5000 ккал/день навіть із коридором ±500 ккал. Змініть ціль або поповніть пул страв.',
  ],
  [
    { code: 'emptyPool' },
    'Пул страв порожній — додайте страви на екрані «Страви».',
  ],
]

const SLOT_FAILURES: ReadonlyArray<[SlotFailure, string]> = [
  [{ code: 'noDay', day: 43 }, 'У плані немає дня №43.'],
  [{ code: 'unknownSlot', slot: 'brunch' }, 'Невідомий тип слота: «brunch».'],
  [
    { code: 'noSlot', day: 1, slot: 'snack' },
    'У дні №1 немає слота «Перекус».',
  ],
  [
    {
      code: 'typeMismatch',
      meal: 'Omelette',
      mealType: 'dinner',
      slot: 'lunch',
    },
    'Страва «Omelette» — це вечеря, а слот — «Обід».',
  ],
]

const REASONS: ReadonlyArray<[SwapReason, string]> = [
  ['dayIncomplete', 'калорійність дня неповна'],
  ['outsideCorridor', 'поза коридором'],
  ['repeatSoon', 'повтор поруч'],
  ['breaksMix', 'ламає мікс планів'],
]

const PLAN_FLAGS: ReadonlyArray<[PlanFlag, string]> = [
  ['repeat', 'Повтор страви попереднього дня — окрема страва вже є вище.'],
  ['dessert-split', 'Назву відділено від опису порції — перевірте.'],
  ['dup', 'Дублікат назви — така страва вже є вище.'],
  ['no-kcal', 'У PDF немає калорійності — впишіть вручну, щоб додати в пул.'],
]

const CYRILLIC_EXCEPT_PORTION = /[А-ЕЗ-ЦШ-ЯЄІЇҐа-яєіїґ]/u

test('попередження тижня українською — дослівно ті самі тексти, що до кодів', () => {
  for (const [warning, text] of WARNINGS) {
    assert.equal(uk.week.warning(warning), text)
  }
})

test('відмови генератора й заміни українською — дослівно ті самі тексти', () => {
  for (const [failure, text] of GENERATE_FAILURES) {
    assert.equal(uk.week.failure(failure), text)
  }
  for (const [failure, text] of SLOT_FAILURES) {
    assert.equal(uk.swap.failure(failure), text)
  }
  for (const [reason, text] of REASONS) {
    assert.equal(uk.swap.reason[reason], text)
  }
})

test('позначки розбору PDF українською — дослівно ті самі тексти, що були в ядрі', () => {
  for (const [flag, text] of PLAN_FLAGS) {
    assert.equal(uk.pdf.flag[flag], text)
  }
})

test('кожен переклад має текст без кирилиці для кожного коду ядра', () => {
  for (const t of [en, pl, de]) {
    const texts = [
      ...WARNINGS.map(([warning]) => t.week.warning(warning)),
      ...GENERATE_FAILURES.map(([failure]) => t.week.failure(failure)),
      ...SLOT_FAILURES.map(([failure]) => t.swap.failure(failure)),
      ...REASONS.map(([reason]) => t.swap.reason[reason]),
      ...Object.values(t.pdf.flag),
    ]
    for (const text of texts) {
      assert.ok(text.trim(), 'порожній текст')
      assert.doesNotMatch(text, CYRILLIC_EXCEPT_PORTION, text)
    }
  }
})

test('англійська нестача пулу рахує множини англійською', () => {
  assert.match(
    en.week.poolShortage([{ type: 'lunch', have: 0, need: 1 }], 1),
    /once every 1 day” needs at least 1 meal of each type/,
  )
})
