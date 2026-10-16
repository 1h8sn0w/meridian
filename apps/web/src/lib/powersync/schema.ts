import { Schema, Table, column } from '@powersync/web'

const syncColumns = {
  family_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
}

const profile = new Table({
  ...syncColumns,
  name: column.text,
  target_calories: column.integer,
  corridor: column.integer,
  color: column.text,
  shared_plan_with: column.text,
  portion: column.text,
  goal_protein: column.real,
  goal_fat: column.real,
  goal_carbs: column.real,
  meal_ids: column.text,
})

const meal = new Table({
  ...syncColumns,
  name: column.text,
  type: column.text,
  calories: column.integer,
  calories_approx: column.integer,
  protein: column.real,
  fat: column.real,
  carbs: column.real,
  calories_w: column.integer,
  protein_w: column.real,
  fat_w: column.real,
  carbs_w: column.real,
  ingredients: column.text,
  source: column.text,
  portions: column.text,
  gerd: column.integer,
  source_issues: column.text,
})

const recipe = new Table(
  {
    ...syncColumns,
    meal_id: column.text,
    steps: column.text,
    prep_time: column.integer,
    servings: column.integer,
    photo: column.text,
  },
  { indexes: { meal: ['meal_id'] } },
)

const mealPref = new Table(
  {
    ...syncColumns,
    meal_id: column.text,
    value: column.text,
  },
  { indexes: { meal: ['meal_id'] } },
)

const weekPlan = new Table(
  {
    ...syncColumns,
    profile_id: column.text,
    generated_at: column.text,
    start_date: column.text,
    target_calories: column.integer,
    corridor: column.integer,
    anti_repeat_days: column.integer,
    days: column.integer,
    used_corridor: column.integer,
    sources: column.text,
    warnings: column.text,
  },
  { indexes: { profileStart: ['profile_id', 'start_date'] } },
)

const planSlot = new Table(
  {
    ...syncColumns,
    week_plan_id: column.text,
    profile_id: column.text,
    date: column.text,
    day_index: column.integer,
    slot: column.text,
    meal_id: column.text,
    swapped: column.integer,
  },
  {
    indexes: {
      profileDate: ['profile_id', 'date'],
      week: ['week_plan_id'],
    },
  },
)

const shoppingCheck = new Table(
  {
    ...syncColumns,
    item_key: column.text,
    fingerprint: column.text,
    checked: column.integer,
  },
  { indexes: { fingerprint: ['fingerprint'] } },
)

const familySettings = new Table({
  ...syncColumns,
  breakfast_start: column.integer,
  breakfast_end: column.integer,
  lunch_start: column.integer,
  lunch_end: column.integer,
  dinner_start: column.integer,
  dinner_end: column.integer,
  anti_repeat_days: column.integer,
})

export const AppSchema = new Schema({
  profile,
  meal,
  recipe,
  meal_pref: mealPref,
  week_plan: weekPlan,
  plan_slot: planSlot,
  shopping_check: shoppingCheck,
  family_settings: familySettings,
})

export const JSON_COLUMNS: Readonly<Record<string, ReadonlyArray<string>>> = {
  profile: ['meal_ids'],
  meal: ['ingredients', 'portions', 'source_issues'],
  recipe: ['steps'],
  week_plan: ['sources', 'warnings'],
}

export const BOOLEAN_COLUMNS: Readonly<Record<string, ReadonlyArray<string>>> =
  {
    meal: ['calories_approx', 'gerd'],
    plan_slot: ['swapped'],
    shopping_check: ['checked'],
  }

export const SYNCED_TABLES = AppSchema.tables.map((table) => table.name)
