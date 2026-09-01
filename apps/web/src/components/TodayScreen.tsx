/**
 * Екран «Сьогодні» (MER-9, MER-11, MER-49) — годинник дня й страва поточного
 * прийому.
 *
 * Це головний екран продукту: він відповідає на питання «що їсти зараз», не
 * змушуючи гортати план. Поза вікнами прийомів показує найближчий наступний —
 * можливо, вже завтрашній, і тоді бере страву наступного дня плану.
 *
 * Усе читається з локального SQLite, тож екран однаково працює офлайн і
 * оновлюється сам, коли зміна приїде з іншого пристрою (MER-46).
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  MEAL_TYPE_LABELS,
  dateKey,
  formatCalories,
  formatMealCalories,
  planOwnerId,
} from '@meridian/core'
import type { MealType, PortionLetter, TastePrefs } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  prefOf,
  useMeals,
  useProfiles,
  useTastePrefs,
  useWeek,
} from '../lib/data/queries'
import type { DayView, WeekView } from '../lib/data/model'
import { formatToday } from '../lib/format'
import { minutesOf, useNow } from '../lib/use-now'
import { formatMinute, slotAt } from '../lib/day-clock'
import { AppShell } from './AppShell'
import { DayClock } from './DayClock'
import { MealDetails } from './MealDetails'
import { ProfileSwitcher } from './ProfileSwitcher'
import { ProfilesSheet } from './ProfilesSheet'
import { SwapDialog } from './SwapDialog'
import { Button, Hint, Panel, Tag, Warn } from './ui'

/** Позначка смаку (MER-18) — та сама, що в плані тижня й у списку страв. */
export function TasteMark({
  value,
}: {
  value: 'favorite' | 'disliked' | null
}) {
  if (!value) return null
  return value === 'favorite' ? (
    <Tag tone="accent">♥</Tag>
  ) : (
    <Tag tone="warn">🚫</Tag>
  )
}

export function TodayScreen({ familyId }: { familyId: string }) {
  const now = useNow()
  const minutes = now === null ? null : minutesOf(now)
  const todayKey = now === null ? '' : dateKey(now)

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const prefsRead = useTastePrefs()
  const { profile, setActive } = useActiveProfile(profilesRead.data)
  const week = useWeek(
    profile ? planOwnerId(profile) : null,
    mealsRead.data,
    todayKey,
  )

  const [managing, setManaging] = useState(false)
  const [swapping, setSwapping] = useState<{
    dayIndex: number
    slot: MealType
  } | null>(null)

  const problems = [
    ...mealsRead.problems,
    ...profilesRead.problems,
    ...prefsRead.problems,
    ...week.problems,
  ]

  return (
    <AppShell
      title="Сьогодні"
      subtitle={now === null ? undefined : formatToday(now)}
    >
      {problems.map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      {profilesRead.data.length ? (
        <ProfileSwitcher
          profiles={profilesRead.data}
          activeId={profile?.id ?? null}
          onSelect={setActive}
          onManage={() => setManaging(true)}
        />
      ) : null}

      <Panel>
        <DayClock minutes={minutes} full />
      </Panel>

      {profile ? (
        <CurrentMeal
          minutes={minutes}
          week={week.data}
          profileName={profile.name}
          portion={profile.portion}
          showProfileName={profilesRead.data.length > 1}
          prefs={prefsRead.data}
          onSwap={(dayIndex, slot) => setSwapping({ dayIndex, slot })}
        />
      ) : (
        <Panel title="Спершу — профіль">
          <Hint>
            Профіль — це раціон: ціль калорійності, коридор і порція з плану
            дієтолога. Без нього генератору немає під що збирати тиждень.
          </Hint>
          <Button block variant="primary" onClick={() => setManaging(true)}>
            Створити профіль
          </Button>
        </Panel>
      )}

      {managing ? (
        <ProfilesSheet
          profiles={profilesRead.data}
          meals={mealsRead.data}
          familyId={familyId}
          onClose={() => setManaging(false)}
        />
      ) : null}

      {swapping && week.data ? (
        <SwapDialog
          view={week.data}
          dayIndex={swapping.dayIndex}
          slot={swapping.slot}
          pool={mealsRead.data}
          prefs={prefsRead.data}
          onClose={() => setSwapping(null)}
        />
      ) : null}
    </AppShell>
  )
}

/* ==========================================================================
 * Картка поточного прийому (MER-11)
 * ======================================================================== */

function CurrentMeal({
  minutes,
  week,
  profileName,
  portion,
  showProfileName,
  prefs,
  onSwap,
}: {
  minutes: number | null
  week: WeekView | null
  profileName: string
  portion: PortionLetter | null
  showProfileName: boolean
  prefs: TastePrefs
  onSwap: (dayIndex: number, slot: MealType) => void
}) {
  const heading = (
    <h2 className="mb-2 mt-0 text-base font-bold">
      Поточна страва
      {showProfileName ? (
        <span className="text-accent"> · {profileName}</span>
      ) : null}
    </h2>
  )

  if (!week) {
    return (
      <Panel>
        {heading}
        <Hint>
          Плану ще немає — згенеруйте тиждень, і тут з’явиться страва поточного
          прийому.
        </Hint>
        <Link to="/week" className="no-underline">
          <Button block>Відкрити екран «Тиждень»</Button>
        </Link>
      </Panel>
    )
  }

  if (minutes === null) {
    return (
      <Panel>
        {heading}
        <Hint>Читаємо годинник пристрою…</Hint>
      </Panel>
    )
  }

  // Активний прийом; поза вікнами — найближчий наступний. Якщо його початок уже
  // позаду, це вже завтрашній прийом, і страву беремо з наступного дня плану.
  const active = slotAt(minutes)
  const slot: MealType | null = active.type ?? active.next?.type ?? null
  const dayOffset =
    !active.type && active.next && active.next.startMinute <= minutes ? 1 : 0

  const todayIndex = week.days.findIndex((day) => day.isToday)
  const dayIndex = todayIndex === -1 ? -1 : todayIndex + dayOffset
  const day = dayIndex >= 0 ? week.days[dayIndex] : undefined
  const slotView = slot && day ? day.byType[slot] : undefined
  const meal = slotView?.meal ?? null

  if (!slot) {
    return (
      <Panel>
        {heading}
        <Hint>Часових вікон прийомів немає — годинник дня порожній.</Hint>
      </Panel>
    )
  }

  if (!meal || !day) {
    return (
      <Panel>
        {heading}
        <Hint>
          {todayIndex === -1
            ? 'Сьогодні поза періодом збереженого плану — перегенеруйте тиждень.'
            : slotView
              ? 'Страву цього слота видалено з пулу — перегенеруйте тиждень.'
              : 'Наступний прийом уже поза періодом плану — перегенеруйте тиждень.'}
        </Hint>
      </Panel>
    )
  }

  const label = active.type
    ? 'Зараз: ' +
      MEAL_TYPE_LABELS[active.type] +
      ' (до ' +
      formatMinute(active.window.endMinute) +
      ')'
    : active.next
      ? 'Далі: ' +
        active.next.label +
        ' о ' +
        formatMinute(active.next.startMinute) +
        (dayOffset ? ' (завтра)' : '')
      : ''

  return (
    <Panel>
      {heading}
      <p className="mb-0.5 mt-0 text-sm text-muted">{label}</p>

      <div className="flex items-center justify-between gap-2.5 border-b border-line py-2.5">
        <div className="min-w-0 flex-auto">
          <div className="text-sm">
            {/* Назва веде на сторінку рецепта (MER-63) — саме звідси її
                відкривають найчастіше: страва вже на столі. */}
            <Link
              to="/recipe/$mealId"
              params={{ mealId: meal.id }}
              className="text-content underline decoration-line underline-offset-4"
            >
              {meal.name}
            </Link>{' '}
            <TasteMark value={prefOf(prefs, meal.id)} />
          </div>
          {meal.source ? (
            <div className="mt-0.5 text-xs text-muted">{meal.source}</div>
          ) : null}
        </div>
        <div className="whitespace-nowrap text-sm text-accent">
          {formatMealCalories(meal)}
        </div>
      </div>

      <MealDetails meal={meal} portion={portion} />

      <DayTotal
        day={day}
        target={week.params.targetCalories}
        corridor={week.usedCorridor}
      />

      {/* MER-33: у прожитому дні заміни немає — історія незмінна. */}
      {day.isPast ? null : (
        <Button block onClick={() => onSwap(dayIndex, slot)}>
          Замінити страву
        </Button>
      )}
    </Panel>
  )
}

/**
 * Підсумок дня. Коли калорійність відома не для всіх слотів, сума неповна — і
 * ми кажемо це окремим реченням, а не ховаємо за «≈»: приблизність і неповнота
 * — різні речі (MER-26).
 */
function DayTotal({
  day,
  target,
  corridor,
}: {
  day: DayView
  target: number
  corridor: number
}) {
  const total = formatCalories(day.calories.total, day.calories.approx)
  if (!total) {
    return (
      <p className="mb-3 mt-2.5 text-sm text-muted">
        Калорійність дня невідома — у страв цього дня немає цифр.
      </p>
    )
  }
  const within =
    day.calories.unknown === 0 &&
    Math.abs(day.calories.total - target) <= corridor
  return (
    <p
      className={`mb-3 mt-2.5 text-sm ${within ? 'text-success' : 'text-warning'}`}
    >
      Разом за день: {total} · ціль {target} ± {corridor} ккал
      {day.calories.unknown > 0
        ? ' · сума неповна: без цифр ' + day.calories.unknown + ' слот(и)'
        : within
          ? ''
          : ' · поза коридором'}
    </p>
  )
}
