/**
 * Профілі: список і форма (MER-21, MER-17, MER-24, MER-31).
 *
 * Профіль — раціон, а не акаунт: ціль калорійності, коридор, порційна літера з
 * плану дієтолога і, за потреби, звужений пул страв. Пул і смаки лишаються
 * спільними для сім'ї — профіль лише вирішує, що з них йому видно.
 *
 * Три правила тут не обговорюються, бо кожне колись ламало дані:
 *
 *  - **спільний план — це один крок, а не ланцюг** (MER-31): профіль, який уже
 *    є власником плану для інших, не може сам приєднатися до чужого;
 *  - **порційна літера береться з плану, а не обчислюється** (MER-24);
 *  - **`null` і порожній список страв — різні стани**: перше означає «увесь
 *    пул», друге — «жодної страви». Саме тому в схемі `meal_ids` nullable.
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { usePowerSync } from '@powersync/react'
import { DEFAULTS, MEAL_TYPE_LABELS, formatMealCalories } from '@meridian/core'
import type { Meal, PortionLetter } from '@meridian/core'
import {
  DEFAULT_PROFILE_COLOR,
  PROFILE_COLORS,
  hexToRgba,
} from '../lib/active-profile'
import {
  deleteProfile,
  insertProfile,
  updateProfile,
} from '../lib/data/mutations'
import type { ProfileInput } from '../lib/data/mutations'
import type { AppProfile } from '../lib/data/model'
import {
  Avatar,
  Button,
  Field,
  Hint,
  LinkButton,
  SelectField,
  Sheet,
  Tag,
  Warn,
} from './ui'

type Draft = {
  id: string | null
  name: string
  targetCalories: string
  corridor: string
  color: string
  portion: '' | PortionLetter
  sharedPlanWith: string
  goalProtein: string
  goalFat: string
  goalCarbs: string
  /** null — увесь спільний пул. */
  mealIds: Array<string> | null
}

function draftOf(profile: AppProfile | null): Draft {
  if (!profile) {
    return {
      id: null,
      name: '',
      targetCalories: String(DEFAULTS.targetCalories),
      corridor: String(DEFAULTS.corridor),
      color: DEFAULT_PROFILE_COLOR,
      portion: '',
      sharedPlanWith: '',
      goalProtein: '',
      goalFat: '',
      goalCarbs: '',
      mealIds: null,
    }
  }
  const num = (value: number | null) => (value === null ? '' : String(value))
  return {
    id: profile.id,
    name: profile.name,
    targetCalories: String(profile.targetCalories),
    corridor: String(profile.corridor),
    color: profile.color,
    portion: profile.portion ?? '',
    sharedPlanWith: profile.sharedPlanWith ?? '',
    goalProtein: num(profile.goalProtein),
    goalFat: num(profile.goalFat),
    goalCarbs: num(profile.goalCarbs),
    mealIds: profile.mealIds,
  }
}

/** Порожнє поле — це «не задано», а не нуль. */
function optional(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validate(
  draft: Draft,
  profiles: ReadonlyArray<AppProfile>,
): { input: ProfileInput } | { error: string } {
  const name = draft.name.trim()
  if (!name) return { error: "Ім'я профілю обов'язкове." }

  const targetCalories = Number(draft.targetCalories)
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) {
    return { error: 'Цільова калорійність дня має бути додатним числом.' }
  }

  const corridor = Number(draft.corridor)
  if (!Number.isFinite(corridor) || corridor < 0) {
    return { error: "Коридор калорійності має бути невід'ємним числом." }
  }

  const shared = draft.sharedPlanWith.trim()
  if (shared) {
    if (shared === draft.id) {
      return { error: 'Профіль не може ділити план сам із собою.' }
    }
    const owner = profiles.find((p) => p.id === shared)
    if (!owner) return { error: 'Профіль для спільного плану не знайдено.' }
    if (owner.sharedPlanWith) {
      return {
        error:
          'Профіль «' +
          owner.name +
          '» сам користується спільним планом — оберіть профіль-власник.',
      }
    }
    // MER-31: reparent власника зробив би ланцюг B→A→C, у якому `planOwnerId`
    // резолвить лише один крок — і хтось читав би не свій план.
    //
    // Лише для наявного профілю: у нового `draft.id` — null, а `sharedPlanWith`
    // незалежного профілю теж null, тож без цієї перевірки кожен самостійний
    // профіль зараховувався б новому в «залежні».
    const dependants = draft.id
      ? profiles.filter(
          (p) => p.id !== draft.id && p.sharedPlanWith === draft.id,
        )
      : []
    if (dependants.length) {
      return {
        error:
          'Профіль «' +
          name +
          '» уже є власником спільного плану для: ' +
          dependants.map((p) => '«' + p.name + '»').join(', ') +
          ". Спершу від'єднайте їх.",
      }
    }
  }

  for (const [label, value] of [
    ['Білки', draft.goalProtein],
    ['Жири', draft.goalFat],
    ['Вуглеводи', draft.goalCarbs],
  ] as const) {
    const parsed = optional(value)
    if (value.trim() && parsed === null) {
      return { error: 'Ціль «' + label + '» має бути числом.' }
    }
    if (parsed !== null && parsed < 0) {
      return { error: 'Ціль «' + label + "» має бути невід'ємною." }
    }
  }

  return {
    input: {
      name,
      targetCalories: Math.round(targetCalories),
      corridor: Math.round(corridor),
      color: draft.color,
      portion: draft.portion === '' ? null : draft.portion,
      sharedPlanWith: shared || null,
      goalProtein: optional(draft.goalProtein),
      goalFat: optional(draft.goalFat),
      goalCarbs: optional(draft.goalCarbs),
      mealIds: draft.mealIds,
    },
  }
}

export function ProfilesSheet({
  profiles,
  meals,
  familyId,
  onClose,
}: {
  profiles: ReadonlyArray<AppProfile>
  meals: ReadonlyArray<Meal>
  familyId: string
  onClose: () => void
}) {
  const db = usePowerSync()
  const [draft, setDraft] = useState<Draft | null>(
    // Сім'я без жодного профілю одразу відкриває форму: список порожній, і
    // показувати його немає сенсу.
    profiles.length ? null : draftOf(null),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patch = (part: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...part } : current))

  const save = async () => {
    if (!draft) return
    const checked = validate(draft, profiles)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (draft.id) await updateProfile(db, draft.id, checked.input)
      else await insertProfile(db, familyId, checked.input)
      if (profiles.length === 0) onClose()
      else setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    if (profiles.length === 1) {
      setError('Не можна видалити останній профіль.')
      return
    }
    const profile = profiles.find((p) => p.id === draft.id)
    if (
      !window.confirm(
        'Видалити профіль «' +
          (profile?.name ?? '') +
          '»? Його тиждень і календар теж зникнуть.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteProfile(db, draft.id)
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return (
      <Sheet title="Профілі" onClose={onClose}>
        <ul className="m-0 list-none p-0">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0"
            >
              <Avatar
                letter={profile.name.trim().charAt(0).toUpperCase() || '?'}
                color={profile.color}
                soft={hexToRgba(profile.color, 0.18)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{profile.name}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {profile.targetCalories} ± {profile.corridor} ккал
                  {profile.portion ? ' · порція ' + profile.portion : ''}
                  {profile.sharedPlanWith ? ' · спільний план' : ''}
                  {profile.mealIds ? ' · пул: ' + profile.mealIds.length : ''}
                </span>
              </span>
              <LinkButton onClick={() => setDraft(draftOf(profile))}>
                Змінити
              </LinkButton>
            </li>
          ))}
        </ul>
        {error ? <Warn>{error}</Warn> : null}
        <div className="mt-3">
          <Button
            block
            variant="primary"
            onClick={() => setDraft(draftOf(null))}
          >
            + Додати профіль
          </Button>
        </div>
      </Sheet>
    )
  }

  /* Власником спільного плану може бути лише профіль, який сам план не ділить. */
  const owners = profiles.filter((p) => p.id !== draft.id && !p.sharedPlanWith)

  return (
    <Sheet
      title={draft.id ? 'Редагувати профіль' : 'Новий профіль'}
      onClose={onClose}
    >
      <Field
        label="Ім’я"
        value={draft.name}
        placeholder="Мій профіль"
        onChange={(e) => patch({ name: e.target.value })}
      />

      <div className="flex gap-2 [&>*]:flex-1">
        <Field
          label="Ціль, ккал/день"
          type="number"
          min={1}
          step={10}
          value={draft.targetCalories}
          onChange={(e) => patch({ targetCalories: e.target.value })}
        />
        <Field
          label="Коридор, ±ккал"
          type="number"
          min={0}
          step={10}
          value={draft.corridor}
          onChange={(e) => patch({ corridor: e.target.value })}
        />
      </div>

      <div className="mb-2.5">
        <span className="block text-sm text-muted">Колір</span>
        <div className="mb-0.5 mt-1 flex gap-3">
          {PROFILE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={'Колір ' + color}
              aria-pressed={draft.color === color}
              onClick={() => patch({ color })}
              style={{ '--swatch-color': color } as CSSProperties}
              className={`h-7 w-7 cursor-pointer rounded-full border-0 bg-swatch p-0 ${
                draft.color === color
                  ? 'ring-2 ring-swatch ring-offset-2 ring-offset-surface'
                  : ''
              }`}
            />
          ))}
        </div>
      </div>

      <SelectField
        label="Порція з плану дієтолога"
        value={draft.portion}
        onChange={(e) =>
          patch({ portion: e.target.value as '' | PortionLetter })
        }
      >
        <option value="">— не задано</option>
        <option value="Ж">Ж</option>
        <option value="Ч">Ч</option>
      </SelectField>

      <SelectField
        label="Спільний план із профілем"
        value={draft.sharedPlanWith}
        onChange={(e) => patch({ sharedPlanWith: e.target.value })}
      >
        <option value="">— власний план</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name}
          </option>
        ))}
      </SelectField>
      <Hint>
        Пов’язані профілі їдять ті самі страви — план у них один, власників.
      </Hint>

      <div className="flex gap-2 [&>*]:flex-1">
        <Field
          label="Білки, г"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={draft.goalProtein}
          onChange={(e) => patch({ goalProtein: e.target.value })}
        />
        <Field
          label="Жири, г"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={draft.goalFat}
          onChange={(e) => patch({ goalFat: e.target.value })}
        />
        <Field
          label="Вуглеводи, г"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={draft.goalCarbs}
          onChange={(e) => patch({ goalCarbs: e.target.value })}
        />
      </div>

      <div className="mb-2.5">
        <span className="block text-sm text-muted">Пул страв</span>
        <label className="mt-1 flex items-center gap-2 text-sm text-content">
          <input
            type="checkbox"
            className="m-0 w-auto accent-accent"
            checked={draft.mealIds === null}
            onChange={(e) =>
              patch({
                mealIds: e.target.checked ? null : meals.map((m) => m.id),
              })
            }
          />
          Увесь спільний пул
        </label>
        {draft.mealIds !== null ? (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-line px-2.5 py-1">
            {meals.length === 0 ? (
              <Hint>Пул порожній — додайте страви на екрані «Страви».</Hint>
            ) : null}
            {meals.map((meal) => {
              const on = draft.mealIds?.includes(meal.id) ?? false
              return (
                <label
                  key={meal.id}
                  className="flex items-center gap-2 border-b border-line py-1.5 text-sm text-content last:border-b-0"
                >
                  <input
                    type="checkbox"
                    className="m-0 w-auto accent-accent"
                    checked={on}
                    onChange={(e) =>
                      patch({
                        mealIds: e.target.checked
                          ? [...(draft.mealIds ?? []), meal.id]
                          : (draft.mealIds ?? []).filter(
                              (id) => id !== meal.id,
                            ),
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">{meal.name}</span>
                  <Tag>{MEAL_TYPE_LABELS[meal.type]}</Tag>
                  <span className="whitespace-nowrap text-xs text-muted">
                    {formatMealCalories(meal)}
                  </span>
                </label>
              )
            })}
          </div>
        ) : null}
      </div>

      {error ? <Warn>{error}</Warn> : null}

      <div className="mt-3.5 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Зберегти
        </Button>
        {profiles.length ? (
          <Button disabled={busy} onClick={() => setDraft(null)}>
            Скасувати
          </Button>
        ) : null}
        <span className="flex-1" />
        {draft.id ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="cursor-pointer rounded-xl border border-warning bg-transparent px-3.5 py-2.5 text-sm text-warning disabled:cursor-not-allowed disabled:opacity-50"
          >
            Видалити
          </button>
        ) : null}
      </div>
    </Sheet>
  )
}
