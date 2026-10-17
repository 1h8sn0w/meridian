import { optionalNumber, requiredNumber } from './provenance.ts'
import { derivedId, mealPrefId } from './sync-ids.ts'
import { MEAL_TYPES, NO_NUTRITION } from './types.ts'
import type {
  Ingredient,
  Meal,
  MealPrefValue,
  MealType,
  Nutrition,
  Portion,
  PortionLetter,
  Profile,
} from './types.ts'

const MEALS_KEY = 'meridian.meals.v1'
const PREFS_KEY = 'meridian.mealPrefs.v1'
const PROFILES_KEY = 'meridian.profiles.v1'

const NOT_MIGRATED: ReadonlyArray<{ prefix: string; reason: string }> = [
  {
    prefix: 'meridian.week.v1',
    reason:
      'план тижня не переноситься: у V1 він зберігав знімки страв, а слот V2' +
      ' посилається на страву з пулу. Тиждень генерується наново.',
  },
  {
    prefix: 'meridian.calendar.v1',
    reason:
      'календар не переноситься: історія лишається у V1, а календар V2' +
      ' починається з дня імпорту.',
  },
  {
    prefix: 'meridian.shopping.v1',
    reason:
      "позначки списку покупок не переносяться: вони прив'язані до відбитка" +
      ' планів, які не переносяться.',
  },
  {
    prefix: 'meridian.app.v1',
    reason: 'стан інтерфейсу не переноситься: у V2 активний екран — це адреса.',
  },
]

export type MigratedRecipe = {
  id: string
  mealId: string
  steps: Array<string>
  prepTime: number | null
  servings: number | null
  photo: string | null
}

export type MigratedPref = {
  id: string
  mealId: string
  value: MealPrefValue
}

export type MigratedProfile = Profile & { color: string }

export type Skipped = {
  what: string
  reason: string
}

export type V1Migration = {
  meals: Array<Meal>
  recipes: Array<MigratedRecipe>
  profiles: Array<MigratedProfile>
  prefs: Array<MigratedPref>
  skipped: Array<Skipped>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function trimmed(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function required(value: unknown, what: string): string {
  const text = trimmed(value)
  if (!text) throw new Error(what + ' — порожнє поле.')
  return text
}

function ingredient(entry: unknown, what: string): Ingredient | null {
  if (typeof entry === 'string') return entry.trim() || null
  if (isRecord(entry)) {
    const name = trimmed(entry.name)
    if (!name) return null
    const amount = optionalNumber(
      entry.amount,
      what + ': кількість «' + name + '»',
    )
    const unit = trimmed(entry.unit)
    const out: Ingredient = { name }
    if (amount !== null) out.amount = amount
    if (unit) out.unit = unit
    return out
  }
  return null
}

function portion(entry: unknown): Portion | null {
  if (typeof entry === 'string' || typeof entry === 'number') {
    const text = String(entry).trim()
    return text ? { component: null, text } : null
  }
  if (isRecord(entry)) {
    const text = trimmed(entry.text)
    if (!text) return null
    return { component: trimmed(entry.component) || null, text }
  }
  return null
}

function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

function migrateMeal(raw: Record<string, unknown>, familyId: string): Meal {
  const v1Id = required(raw.id, 'id страви')
  const name = required(raw.name, 'назва страви')
  const type = trimmed(raw.type)
  if (!MEAL_TYPES.includes(type as MealType)) {
    throw new Error('невідомий тип слота «' + type + '».')
  }

  const nutritionCh: Nutrition = {
    calories: optionalNumber(raw.calories, 'калорійність'),
    protein: optionalNumber(raw.protein, 'білки'),
    fat: optionalNumber(raw.fat, 'жири'),
    carbs: optionalNumber(raw.carbs, 'вуглеводи'),
  }
  return {
    id: derivedId(familyId, 'meal', v1Id),
    name,
    type: type as MealType,
    ...nutritionCh,
    caloriesApprox: raw.caloriesApprox === true,
    nutrition: { Ч: nutritionCh, Ж: { ...NO_NUTRITION } },
    ingredients: list(raw.ingredients)
      .map((entry) => ingredient(entry, 'страва «' + name + '»'))
      .filter((x): x is Ingredient => x !== null),
    source: trimmed(raw.source),
    portions: list(raw.portions)
      .map(portion)
      .filter((x): x is Portion => x !== null),
    gerd: false,
    sourceIssues: [],
  }
}

function migrateRecipe(
  raw: Record<string, unknown>,
  familyId: string,
  v1Id: string,
): MigratedRecipe | null {
  const steps = list(raw.steps)
    .map((step) => trimmed(step))
    .filter((step) => step.length > 0)
  const prepTime = optionalNumber(raw.prepTime, 'час приготування')
  const servings = optionalNumber(raw.servings, 'кількість порцій')
  if (servings !== null && servings <= 0) {
    throw new Error('кількість порцій має бути додатною.')
  }
  const photo = trimmed(raw.photo) || null

  if (!steps.length && prepTime === null && servings === null && !photo) {
    return null
  }
  return {
    id: derivedId(familyId, 'recipe', v1Id),
    mealId: derivedId(familyId, 'meal', v1Id),
    steps,
    prepTime,
    servings,
    photo,
  }
}

const FALLBACK_COLOR = '#4f9dff'

function migrateProfile(
  raw: Record<string, unknown>,
  familyId: string,
): MigratedProfile {
  const v1Id = required(raw.id, 'id профілю')
  const name = required(raw.name, 'ім’я профілю')

  const targetCalories = requiredNumber(
    raw.targetCalories,
    'цільова калорійність',
  )
  if (targetCalories <= 0) {
    throw new Error('цільова калорійність має бути додатною.')
  }
  const corridor = requiredNumber(raw.corridor, 'коридор калорійності')
  if (corridor < 0) {
    throw new Error("коридор калорійності має бути невід'ємним.")
  }

  const letter = trimmed(raw.portion).toUpperCase()
  if (letter && letter !== 'Ж' && letter !== 'Ч') {
    throw new Error('невідома порційна літера «' + letter + '».')
  }

  const color = trimmed(raw.color).toLowerCase()

  let mealIds: Array<string> | null = null
  if (Array.isArray(raw.mealIds)) {
    mealIds = raw.mealIds.map((id) => trimmed(id)).filter((id) => id.length > 0)
  } else if (raw.mealIds !== null && raw.mealIds !== undefined) {
    throw new Error('підмножина страв (mealIds) має бути масивом або null.')
  }

  const goals: Record<string, unknown> = isRecord(raw.goals) ? raw.goals : {}

  return {
    id: derivedId(familyId, 'profile', v1Id),
    name,
    targetCalories,
    corridor,
    color: /^#[0-9a-f]{6}$/.test(color) ? color : FALLBACK_COLOR,
    portion: letter ? (letter as PortionLetter) : null,
    sharedPlanWith: trimmed(raw.sharedPlanWith) || null,
    mealIds,
    goalProtein: optionalNumber(goals.protein, 'ціль по білках'),
    goalFat: optionalNumber(goals.fat, 'ціль по жирах'),
    goalCarbs: optionalNumber(goals.carbs, 'ціль по вуглеводах'),
    withSnack: true,
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function labelOf(raw: unknown, fallback: string): string {
  if (!isRecord(raw)) return fallback
  return trimmed(raw.name) || trimmed(raw.id) || fallback
}

export function migrateV1(dump: unknown, familyId: string): V1Migration {
  if (!trimmed(familyId)) {
    throw new Error('Не вказано сім’ю, у яку імпортувати.')
  }
  if (!isRecord(dump) || !isRecord(dump.data)) {
    throw new Error(
      'Це не схоже на дамп Meridian V1: у файлі немає розділу «data».',
    )
  }
  const data = dump.data
  const skipped: Array<Skipped> = []

  if (isRecord(dump.unreadable)) {
    for (const key of Object.keys(dump.unreadable)) {
      skipped.push({
        what: key,
        reason: 'значення в сховищі не є коректним JSON — розібрати нічого.',
      })
    }
  }

  const meals: Array<Meal> = []
  const recipes: Array<MigratedRecipe> = []
  const mealIdMap = new Map<string, string>()

  const rawMeals = data[MEALS_KEY]
  if (rawMeals !== undefined && !Array.isArray(rawMeals)) {
    skipped.push({
      what: MEALS_KEY,
      reason: 'пул страв у сховищі не є масивом — розібрати нічого.',
    })
  }
  for (const raw of list(rawMeals)) {
    const what = 'Страва «' + labelOf(raw, 'без назви') + '»'
    if (!isRecord(raw)) {
      skipped.push({ what, reason: 'запис страви не є об’єктом.' })
      continue
    }
    const v1Id = trimmed(raw.id)
    let meal: Meal
    try {
      meal = migrateMeal(raw, familyId)
    } catch (error) {
      skipped.push({ what, reason: describe(error) })
      continue
    }
    if (mealIdMap.has(v1Id)) {
      skipped.push({ what, reason: 'страва з таким id уже була в пулі.' })
      continue
    }
    mealIdMap.set(v1Id, meal.id)
    meals.push(meal)

    try {
      const recipe = migrateRecipe(raw, familyId, v1Id)
      if (recipe) recipes.push(recipe)
    } catch (error) {
      skipped.push({ what: what + ', рецепт', reason: describe(error) })
    }
  }

  const prefs: Array<MigratedPref> = []
  const rawPrefs = data[PREFS_KEY]
  if (rawPrefs !== undefined && !isRecord(rawPrefs)) {
    skipped.push({
      what: PREFS_KEY,
      reason: 'смаки у сховищі не є мапою — розібрати нічого.',
    })
  }
  if (isRecord(rawPrefs)) {
    for (const [v1MealId, value] of Object.entries(rawPrefs)) {
      const what = 'Смак страви «' + v1MealId + '»'
      if (value !== 'favorite' && value !== 'disliked') {
        skipped.push({
          what,
          reason: 'невідоме значення смаку «' + trimmed(value) + '».',
        })
        continue
      }
      const mealId = mealIdMap.get(v1MealId)
      if (mealId === undefined) {
        skipped.push({
          what,
          reason: 'страви з таким id немає в перенесеному пулі.',
        })
        continue
      }
      prefs.push({ id: mealPrefId(mealId), mealId, value })
    }
  }

  const profiles: Array<MigratedProfile> = []
  const profileIdMap = new Map<string, string>()
  const sharedRaw = new Map<string, string>()

  const rawProfiles = data[PROFILES_KEY]
  const profileList = isRecord(rawProfiles) ? rawProfiles.profiles : undefined
  if (rawProfiles !== undefined && !Array.isArray(profileList)) {
    skipped.push({
      what: PROFILES_KEY,
      reason: 'профілі у сховищі не є списком — розібрати нічого.',
    })
  }
  for (const raw of list(profileList)) {
    const what = 'Профіль «' + labelOf(raw, 'без імені') + '»'
    if (!isRecord(raw)) {
      skipped.push({ what, reason: 'запис профілю не є об’єктом.' })
      continue
    }
    const v1Id = trimmed(raw.id)
    let profile: MigratedProfile
    try {
      profile = migrateProfile(raw, familyId)
    } catch (error) {
      skipped.push({ what, reason: describe(error) })
      continue
    }
    if (profileIdMap.has(v1Id)) {
      skipped.push({ what, reason: 'профіль з таким id уже був у списку.' })
      continue
    }
    profileIdMap.set(v1Id, profile.id)
    if (profile.sharedPlanWith) {
      sharedRaw.set(profile.id, profile.sharedPlanWith)
    }
    profile.sharedPlanWith = null
    profiles.push(profile)
  }

  for (const profile of profiles) {
    const what = 'Профіль «' + profile.name + '»'

    const rawShared = sharedRaw.get(profile.id)
    if (rawShared !== undefined) {
      const owner = profileIdMap.get(rawShared)
      if (owner === undefined) {
        skipped.push({
          what,
          reason:
            'спільний план не перенесено — профіль-власник не потрапив у' +
            ' міграцію. Профіль отримав власний план.',
        })
      } else if (owner === profile.id) {
        skipped.push({
          what,
          reason:
            'профіль ділив план сам із собою. Профіль отримав власний план.',
        })
      } else {
        profile.sharedPlanWith = owner
      }
    }

    if (profile.mealIds === null) continue
    const kept: Array<string> = []
    let dropped = 0
    for (const v1MealId of profile.mealIds) {
      const mealId = mealIdMap.get(v1MealId)
      if (mealId === undefined) dropped += 1
      else kept.push(mealId)
    }
    if (dropped > 0) {
      skipped.push({
        what,
        reason:
          'у підмножині страв профілю ' +
          dropped +
          ' посилань на страви, яких немає в перенесеному пулі — їх прибрано.',
      })
    }
    profile.mealIds = kept
  }

  for (const key of Object.keys(data)) {
    const rule = NOT_MIGRATED.find(
      (candidate) =>
        key === candidate.prefix || key.startsWith(candidate.prefix + '.'),
    )
    if (rule) skipped.push({ what: key, reason: rule.reason })
  }

  return { meals, recipes, profiles, prefs, skipped }
}
