import { useState } from 'react'
import {
  MEAL_TYPE_LABELS,
  dateKey,
  formatMealCalories,
  poolForProfile,
  poolShortage,
} from '@meridian/core'
import type { MealType, PortionLetter, TastePrefs } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  prefOf,
  useAntiRepeatDays,
  useMeals,
  useProfiles,
  useTastePrefs,
  useWeek,
} from '../lib/data/queries'
import type { WeekView } from '../lib/data/model'
import { formatToday } from '../lib/format'
import { minutesOf, useNow } from '../lib/use-now'
import { formatMinute, slotAt } from '../lib/day-clock'
import { useMealWindows } from '../lib/meal-windows'
import { AntiRepeatPanel } from './AntiRepeat'
import { AppShell } from './AppShell'
import { DayClock } from './DayClock'
import { DayTotal } from './DayTotal'
import { FirstSteps } from './FirstSteps'
import { MealDetails, MealMarks } from './MealDetails'
import { MealHoursPanel } from './MealHours'
import { ProfileSwitcher } from './ProfileSwitcher'
import { ProfilesSheet } from './ProfilesSheet'
import { RecipeLink } from './RecipeLink'
import { RemindersPanel } from './Reminders'
import { SwapDialog } from './SwapDialog'
import { ArrowsLeftRight, Heart, Prohibit } from '@phosphor-icons/react'
import { Button, Hint, Panel, Problems, Tag } from './ui'

export function TasteMark({
  value,
}: {
  value: 'favorite' | 'disliked' | null
}) {
  if (!value) return null
  return value === 'favorite' ? (
    <Tag tone="accent">
      <Heart weight="fill" size={12} role="img" aria-label="Улюблене" />
    </Tag>
  ) : (
    <Tag tone="warn">
      <Prohibit
        weight="bold"
        size={12}
        role="img"
        aria-label="Не подобається"
      />
    </Tag>
  )
}

export function TodayScreen({ familyId }: { familyId: string }) {
  const now = useNow()
  const minutes = minutesOf(now)
  const todayKey = dateKey(now)

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const prefsRead = useTastePrefs()
  const antiRepeatDays = useAntiRepeatDays().data
  const {
    profile,
    planOwnerId: ownerId,
    planOwner: owner,
    setActive,
  } = useActiveProfile(profilesRead.data)
  const week = useWeek(ownerId, mealsRead.data, todayKey)
  const { problems: windowProblems } = useMealWindows()

  const [managing, setManaging] = useState(false)
  const [swapping, setSwapping] = useState<{
    dayIndex: number
    slot: MealType
  } | null>(null)

  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    prefsRead.problems,
    week.problems,
    windowProblems,
  ]

  return (
    <AppShell title="Сьогодні" subtitle={formatToday(now)}>
      <Problems of={problems} />

      {profilesRead.data.length ? (
        <ProfileSwitcher
          profiles={profilesRead.data}
          activeId={profile?.id ?? null}
          onSelect={setActive}
          onManage={() => setManaging(true)}
        />
      ) : null}

      <div className="clock-hero mb-4 px-2">
        <DayClock minutes={minutes} full />
      </div>

      {profilesRead.isLoading ||
      mealsRead.isLoading ||
      week.isLoading ? null : profile && week.data ? (
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
        <FirstSteps
          hasProfile={Boolean(profile)}
          mealCount={mealsRead.data.length}
          shortage={poolShortage(
            poolForProfile(mealsRead.data, owner),
            antiRepeatDays,
          )}
          onCreateProfile={() => setManaging(true)}
        />
      )}

      <MealHoursPanel familyId={familyId} />
      <AntiRepeatPanel familyId={familyId} />
      <RemindersPanel week={week.data} />

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
          antiRepeatDays={antiRepeatDays}
          onClose={() => setSwapping(null)}
        />
      ) : null}
    </AppShell>
  )
}

function CurrentMeal({
  minutes,
  week,
  profileName,
  portion,
  showProfileName,
  prefs,
  onSwap,
}: {
  minutes: number
  week: WeekView
  profileName: string
  portion: PortionLetter | null
  showProfileName: boolean
  prefs: TastePrefs
  onSwap: (dayIndex: number, slot: MealType) => void
}) {
  const heading = (
    <h2 className="mb-2 mt-0 text-lg font-semibold tracking-tight">
      Поточна страва
      {showProfileName ? (
        <span className="text-accent"> · {profileName}</span>
      ) : null}
    </h2>
  )

  const { windows } = useMealWindows()
  const active = slotAt(minutes, windows)
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
        MEAL_TYPE_LABELS[active.next.type] +
        ' о ' +
        formatMinute(active.next.startMinute) +
        (dayOffset ? ' (завтра)' : '')
      : ''

  return (
    <Panel>
      {heading}
      <p className="m-0">
        <Tag tone="accent">{label}</Tag>
      </p>

      <div className="flex items-end justify-between gap-3 border-b border-line pb-4 pt-3">
        <div className="min-w-0 flex-auto">
          <div className="text-xl font-semibold leading-snug tracking-tight">
            <RecipeLink mealId={meal.id}>{meal.name}</RecipeLink>{' '}
            <TasteMark value={prefOf(prefs, meal.id)} />{' '}
            <MealMarks meal={meal} />
          </div>
          {meal.source ? (
            <div className="mt-1 text-xs text-muted">{meal.source}</div>
          ) : null}
        </div>
        <div className="whitespace-nowrap font-mono text-lg font-semibold tabular-nums text-accent">
          {formatMealCalories(meal)}
        </div>
      </div>

      <MealDetails meal={meal} portion={portion} />

      <DayTotal
        calories={day.calories}
        plan={{
          target: week.params.targetCalories,
          corridor: week.usedCorridor,
        }}
      />

      {day.isPast ? null : (
        <div className="mt-4">
          <Button block onClick={() => onSwap(dayIndex, slot)}>
            <ArrowsLeftRight aria-hidden size={18} />
            Замінити страву
          </Button>
        </div>
      )}
    </Panel>
  )
}
