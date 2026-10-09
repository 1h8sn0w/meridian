import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  fieldText,
  linesFromText,
  validateMeal,
  validatePlanEntry,
  validateProfile,
  validateRecipe,
} from './forms.ts'
import type {
  MealDraft,
  PlanEntryDraft,
  ProfileDraft,
  RecipeDraft,
} from './forms.ts'
import type { AppProfile } from './data/model.ts'

const MEAL: MealDraft = {
  name: ' Гречка ',
  type: 'lunch',
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
  ingredients: '',
  portions: '',
  source: '',
  gerd: false,
  sourceIssues: '',
}

const PROFILE: ProfileDraft = {
  id: null,
  name: 'Профіль 1',
  targetCalories: '1800',
  corridor: '100',
  color: '#4f9dff',
  portion: '',
  sharedPlanWith: '',
  goalProtein: '',
  goalFat: '',
  goalCarbs: '',
  mealIds: null,
}

const RECIPE: RecipeDraft = {
  steps: '',
  prepTime: '',
  servings: '',
  photo: null,
}

const ENTRY: PlanEntryDraft = {
  name: 'Омлет',
  type: 'breakfast',
  calories: '320',
  servings: '',
  source: 'План 1',
  ingredients: '',
  portions: '',
  steps: '',
}

const profile = (
  id: string,
  name: string,
  sharedPlanWith: string | null = null,
): AppProfile => ({
  id,
  name,
  targetCalories: 1800,
  corridor: 100,
  portion: null,
  sharedPlanWith,
  goalProtein: null,
  goalFat: null,
  goalCarbs: null,
  mealIds: null,
  color: '#4f9dff',
})

function input<T>(checked: { input: T } | { error: string }): T {
  if ('error' in checked) assert.fail(checked.error)
  return checked.input
}

function error(checked: { input: unknown } | { error: string }): string {
  if (!('error' in checked)) assert.fail('очікувалась помилка')
  return checked.error
}

test('порожнє поле страви лишається порожнім, а нуль — нулем', () => {
  const meal = input(validateMeal({ ...MEAL, calories: '', protein: '0' }))
  assert.equal(meal.name, 'Гречка')
  assert.equal(meal.calories, null)
  assert.equal(meal.protein, 0)
  assert.equal(meal.fat, null)
})

test('калорійність страви округлюється, БЖВ — ні, кома — десятковий роздільник', () => {
  const meal = input(
    validateMeal({ ...MEAL, calories: '320,6', carbs: '12,5' }),
  )
  assert.equal(meal.calories, 321)
  assert.equal(meal.carbs, 12.5)
})

test('не число й від’ємне в полі страви — помилка з назвою поля', () => {
  assert.match(error(validateMeal({ ...MEAL, fat: 'багато' })), /«Жири»/)
  assert.match(error(validateMeal({ ...MEAL, calories: '-1' })), /невід'ємним/)
  assert.match(error(validateMeal({ ...MEAL, name: '  ' })), /Назва/)
})

test('розбіжності в джерелі — по рядку, без порожніх', () => {
  const meal = input(validateMeal({ ...MEAL, sourceIssues: ' а \n\n б ' }))
  assert.deepEqual(meal.sourceIssues, ['а', 'б'])
})

test('ціль профілю обов’язкова й додатна, коридор — невід’ємний', () => {
  const ok = input(validateProfile({ ...PROFILE, corridor: '0' }, []))
  assert.equal(ok.corridor, 0)
  for (const targetCalories of ['', '0', 'багато']) {
    assert.match(
      error(validateProfile({ ...PROFILE, targetCalories }, [])),
      /додатним/,
    )
  }
  assert.match(
    error(validateProfile({ ...PROFILE, corridor: '' }, [])),
    /Коридор/,
  )
})

test('порожня ціль БЖВ профілю — «не задано», а не нуль', () => {
  const ok = input(validateProfile({ ...PROFILE, goalFat: '0' }, []))
  assert.equal(ok.goalProtein, null)
  assert.equal(ok.goalFat, 0)
  assert.match(
    error(validateProfile({ ...PROFILE, goalCarbs: 'x' }, [])),
    /Ціль «Вуглеводи»/,
  )
})

test('спільний план: не з собою, не з профілем, який сам ділить чужий', () => {
  const profiles = [profile('a', 'А'), profile('b', 'Б', 'a')]
  assert.match(
    error(
      validateProfile({ ...PROFILE, id: 'a', sharedPlanWith: 'a' }, profiles),
    ),
    /сам із собою/,
  )
  assert.match(
    error(validateProfile({ ...PROFILE, sharedPlanWith: 'b' }, profiles)),
    /оберіть профіль-власник/,
  )
  assert.equal(
    input(validateProfile({ ...PROFILE, sharedPlanWith: 'a' }, profiles))
      .sharedPlanWith,
    'a',
  )
})

test('власник спільного плану не може сам стати залежним: ланцюг резолвиться лише на крок', () => {
  const profiles = [
    profile('a', 'А'),
    profile('b', 'Б', 'a'),
    profile('c', 'В'),
  ]
  assert.match(
    error(
      validateProfile(
        { ...PROFILE, id: 'a', name: 'А', sharedPlanWith: 'c' },
        profiles,
      ),
    ),
    /уже є власником спільного плану для: «Б»/,
  )
})

test('новий профіль не рахує незалежні профілі своїми залежними', () => {
  const profiles = [profile('a', 'А'), profile('c', 'В')]
  assert.equal(
    input(validateProfile({ ...PROFILE, sharedPlanWith: 'a' }, profiles))
      .sharedPlanWith,
    'a',
  )
})

test('час і порції рецепта — цілі числа: колонки integer, і дріб упав би вже на вивантаженні', () => {
  const recipe = input(
    validateRecipe({ ...RECIPE, prepTime: '7,5', servings: '2' }),
  )
  assert.equal(recipe.prepTime, 8)
  assert.equal(recipe.servings, 2)
})

test('межі рецепта — ті самі, що CHECK-и схеми: час ≥ 0, порції > 0', () => {
  assert.equal(input(validateRecipe({ ...RECIPE, prepTime: '0' })).prepTime, 0)
  assert.match(
    error(validateRecipe({ ...RECIPE, prepTime: '-5' })),
    /невід'ємним/,
  )
  assert.match(error(validateRecipe({ ...RECIPE, servings: '0' })), /додатним/)
  assert.match(error(validateRecipe({ ...RECIPE, servings: 'дві' })), /числом/)
  const empty = input(validateRecipe({ ...RECIPE, steps: ' крок 1 \n\n' }))
  assert.deepEqual(empty, {
    steps: ['крок 1'],
    prepTime: null,
    servings: null,
    photo: null,
  })
})

test('страва з PDF без калорійності в пул не йде: нуль був би вигаданим числом', () => {
  assert.match(
    error(validatePlanEntry({ ...ENTRY, calories: ' ' })),
    /Впишіть калорійність/,
  )
  assert.match(
    error(validatePlanEntry({ ...ENTRY, calories: '320 ккал' })),
    /має бути числом/,
  )
  assert.match(error(validatePlanEntry({ ...ENTRY, servings: '0' })), /Порції/)
})

test('страва з PDF не отримує БЖВ і ГЕРХ: «Ж»/«Ч» у плані — порції, а не жири', () => {
  const { meal, recipe } = input(validatePlanEntry(ENTRY))
  assert.equal(meal.calories, 320)
  assert.equal(meal.protein, null)
  assert.equal(meal.fat, null)
  assert.equal(meal.carbs, null)
  assert.equal(meal.gerd, false)
  assert.equal(recipe, null)
})

test('рецепт із PDF пишеться, лише коли є кроки чи порції, і без часу приготування', () => {
  const { recipe } = input(
    validatePlanEntry({ ...ENTRY, steps: 'Збити яйця\n', servings: '2' }),
  )
  assert.deepEqual(recipe, {
    steps: ['Збити яйця'],
    prepTime: null,
    servings: 2,
    photo: null,
  })
})

test('числове поле форми показує нуль, а відсутнє — порожнім', () => {
  assert.equal(fieldText(0), '0')
  assert.equal(fieldText(null), '')
  assert.equal(fieldText(undefined), '')
  assert.deepEqual(linesFromText(''), [])
})
