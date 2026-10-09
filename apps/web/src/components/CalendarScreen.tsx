/**
 * Екран «Календар» (MER-14, MER-61) — перегляд плану на будь-який день і
 * історія минулих тижнів.
 *
 * Форма та сама, що у V1: сітка одного тижня (пн–нд) із гортанням «‹ / ›»,
 * клік дня показує його прийоми та калорійність. Джерело — локальний SQLite за
 * календарним ключем «профіль + дата» (MER-66), тож екран однаково працює
 * офлайн і бачить дні будь-якого покоління плану.
 *
 * Екран суто читає. Минулі дні — незмінна історія (MER-33), а редагування
 * поточного тижня живе на екрані «Тиждень»: другий шлях запису до тих самих
 * слотів був би другим місцем для помилок LWW. Уся арифметика дат — через
 * `addDays`/`startOfWeek` з ядра: календарний зсув, а не «+24 години», інакше
 * осінній перехід DST дублює або з'їдає день (MER-34).
 *
 * **Сітка тижня й панель дня — окремі компоненти з `key`.** Кожен має власний
 * запит до бази, і при зміні діапазону `useQuery` якийсь час віддає ще СТАРІ
 * рядки. Ключ робить зміну діапазону новим монтуванням: замість чужих даних
 * компонент чесно починає з «завантажується». Тримати це прапорцем
 * «зараз перезапитуємо» не вийшло б — той самий прапорець підіймається й на
 * звичайний прихід даних із sync, і тоді сітка блимала б порожнечею на кожній
 * порції синхронізації. Кнопки гортання лишаються ЗОВНІ ключа: інакше
 * перемонтування забирало б у них фокус на кожному натисканні.
 *
 * **Вибраний день і тиждень — в адресі** (`?day=&week=`, MER-88), як фільтри
 * «Страв»: перезавантаження й «Назад» із рецепта повертають той самий день.
 */

import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  MEAL_TYPE_LABELS,
  addDays,
  dateKey,
  formatDayCalories,
  formatMealCalories,
  planOwnerId,
  startOfWeek,
} from '@meridian/core'
import type { Meal } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  useCalendarDays,
  useDayPlan,
  useMeals,
  usePlannedDayCount,
  useProfiles,
} from '../lib/data/queries'
import { formatDayTitle, formatWeekRange, plural } from '../lib/format'
import { useNow } from '../lib/use-now'
import type { CalendarSearch } from '../lib/calendar-search'
import { AppShell } from './AppShell'
import { DayTotal } from './DayTotal'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { RecipeLink } from './RecipeLink'
import { Button, Hint, IconButton, Meta, Panel, Problems, Tag } from './ui'

/** Тиждень в Україні — з понеділка, як у `startOfWeek`. */
const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

export function CalendarScreen() {
  const todayKey = dateKey(useNow())

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const { profile } = useActiveProfile(profilesRead.data)
  // MER-17/21: пов'язаний профіль дивиться календар власника спільного плану.
  const ownerId = profile ? planOwnerId(profile) : null
  const owner = profilesRead.data.find((p) => p.id === ownerId) ?? profile

  // Вид: понеділок видимого тижня + вибраний день, обидва з адреси. Без них —
  // «тиждень сьогодні»: вид їде за годинником пристрою, і кнопка «Сьогодні»
  // просто прибирає параметри.
  const search = useSearch({ from: '/calendar' })
  const selected = search.day ?? todayKey
  const start = search.week ?? (selected ? startOfWeek(selected) : '')
  const end = start ? addDays(start, 6) : ''
  const navigate = useNavigate({ from: '/calendar' })
  /* Вибір дня й гортання — той самий екран, а не перехід: без нового запису в
   * історії, без стрибка вгору й без анімації зміни екрана. */
  const setView = (next: CalendarSearch) =>
    void navigate({
      search: next,
      replace: true,
      resetScroll: false,
      viewTransition: false,
    })

  const plannedRead = usePlannedDayCount(ownerId)
  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    plannedRead.problems,
  ]

  // Кнопка повертає ОБИДВА: і тиждень, і вибір. Тож ховати її можна лише тоді,
  // коли обидва вже на сьогодні. Інакше після «‹ → вибрати день → ›» вибір
  // лишався б у минулому тижні, жодна клітинка не була б підсвічена — і
  // повернутися до сьогодні не було б чим.
  const atToday =
    todayKey !== '' &&
    start <= todayKey &&
    todayKey <= end &&
    selected === todayKey

  return (
    <AppShell
      title="Календар"
      subtitle={
        plannedRead.data > 0
          ? `Заплановано ${plannedRead.data} ${plural(plannedRead.data, 'день', 'дні', 'днів')}`
          : 'Історія та плани'
      }
    >
      <Problems of={problems} />

      {!profile ? (
        <Panel title="Спершу — профіль">
          <Hint>
            Календар показує план профілю. Створіть його на екрані «Сьогодні».
          </Hint>
        </Panel>
      ) : (
        <>
          {start ? (
            <Panel>
              <div className="mb-3 flex items-center justify-between gap-2">
                <IconButton
                  label="Попередній тиждень"
                  onClick={() =>
                    setView({ week: addDays(start, -7), day: selected })
                  }
                >
                  <CaretLeft size={16} weight="bold" />
                </IconButton>
                <span className="text-base font-semibold tracking-tight">
                  {formatWeekRange(start, end)}
                </span>
                <IconButton
                  label="Наступний тиждень"
                  onClick={() =>
                    setView({ week: addDays(start, 7), day: selected })
                  }
                >
                  <CaretRight size={16} weight="bold" />
                </IconButton>
              </div>

              <WeekGrid
                key={start}
                ownerId={ownerId}
                start={start}
                end={end}
                selected={selected}
                todayKey={todayKey}
                meals={mealsRead.data}
                // День із сітки лежить у видимому тижні, тож тиждень з нього виводиться.
                onSelect={(date) => setView({ day: date })}
              />

              {atToday ? null : (
                <div className="mt-3">
                  <Button block onClick={() => setView({})}>
                    Сьогодні
                  </Button>
                </div>
              )}
            </Panel>
          ) : null}

          {/* Порожня історія — нормальний перший стан, і кажемо це прямо. */}
          {plannedRead.data === 0 && !plannedRead.isLoading ? (
            <Panel>
              <Hint>
                Історія порожня — ще жоден тиждень не згенеровано. Згенеруйте
                перший на екрані «Тиждень», і його дні з’являться тут.
              </Hint>
              <Link to="/week" className="block no-underline">
                <Button block>Відкрити екран «Тиждень»</Button>
              </Link>
            </Panel>
          ) : null}

          {selected ? (
            <DaySection
              key={selected}
              ownerId={ownerId}
              date={selected}
              todayKey={todayKey}
              meals={mealsRead.data}
            />
          ) : null}

          {profile.sharedPlanWith ? (
            <Meta>
              Це календар спільного плану профілю «{owner?.name ?? '—'}».
            </Meta>
          ) : null}
        </>
      )}
    </AppShell>
  )
}

/* ==========================================================================
 * Сітка тижня
 * ======================================================================== */

function WeekGrid({
  ownerId,
  start,
  end,
  selected,
  todayKey,
  meals,
  onSelect,
}: {
  ownerId: string | null
  start: string
  end: string
  selected: string
  todayKey: string
  meals: ReadonlyArray<Meal>
  onSelect: (date: string) => void
}) {
  const daysRead = useCalendarDays(ownerId, start, end, meals)

  return (
    <>
      <Problems of={[daysRead.problems]} />

      {/* Сітка перемонтовується на кожен тиждень (`key={start}`), тож
          гортання тижнів читається як рух, а не як підміна цифр. */}
      <div className="grid grid-cols-7 gap-1 motion-safe:animate-rise">
        {DOW_LABELS.map((dow, i) => {
          const key = addDays(start, i)
          const day = daysRead.data.get(key)
          const kcal = day ? formatDayCalories(day.calories) : ''
          const isSelected = key === selected
          const border = isSelected
            ? 'border-transparent bg-accent-fill text-button-ink shadow-accent'
            : key === todayKey
              ? 'border-accent bg-app text-content'
              : 'border-transparent bg-app text-content hover:border-line'
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              aria-label={
                formatDayTitle(key) +
                (daysRead.isLoading
                  ? ''
                  : day
                    ? kcal
                      ? ', ' + kcal
                      : ''
                    : ', без плану')
              }
              onClick={() => onSelect(key)}
              className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-2xl border px-0 py-2 transition duration-300 ease-spring active:scale-95 ${border}`}
            >
              <span className="text-xs opacity-70">{dow}</span>
              <span className="font-mono text-base font-semibold tabular-nums">
                {Number(key.slice(8, 10))}
              </span>
              {/* «—» — плану немає; порожньо — або план є без цифр, або
                  вибірка ще в дорозі й стверджувати нічого не можна. */}
              <span className="max-w-full truncate px-0.5 font-mono text-xs tabular-nums opacity-70">
                {daysRead.isLoading
                  ? ''
                  : day
                    ? kcal.replace(' ккал', '')
                    : '—'}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ==========================================================================
 * Панель вибраного дня — лише перегляд
 * ======================================================================== */

function DaySection({
  ownerId,
  date,
  todayKey,
  meals,
}: {
  ownerId: string | null
  date: string
  todayKey: string
  meals: ReadonlyArray<Meal>
}) {
  const daysRead = useCalendarDays(ownerId, date, date, meals)
  const planRead = useDayPlan(ownerId, date)
  const day = daysRead.data.get(date) ?? null
  const problems = [daysRead.problems, planRead.problems]

  return (
    <Panel>
      <h2 className="mb-2 mt-0 text-lg font-semibold tracking-tight">
        {formatDayTitle(date)}{' '}
        {date === todayKey ? <Tag tone="accent">сьогодні</Tag> : null}
      </h2>

      <Problems of={problems} />

      {!day ? (
        // Доки запит у дорозі, «плану немає» було б неправдою — мовчимо.
        daysRead.isLoading ? null : (
          <Hint>
            На цей день плану немає.
            {todayKey && date >= todayKey
              ? ' Новий тиждень генерується на екрані «Тиждень» і починається сьогоднішнім днем.'
              : ''}
          </Hint>
        )
      ) : (
        <>
          {day.slots.map((slotView) => (
            <div
              key={slotView.id}
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              {/* Тип прийому над назвою, а не колонкою: на телефоні колонка
                  забирала б у назви страви чверть ширини. */}
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">
                  {MEAL_TYPE_LABELS[slotView.slot]}
                </span>
                <span className="block text-sm font-medium leading-snug">
                  {slotView.meal ? (
                    // MER-88: рецепт і з календаря; «Назад» поверне на цей день.
                    <RecipeLink mealId={slotView.mealId}>
                      {slotView.meal.name}
                    </RecipeLink>
                  ) : (
                    <span className="text-warning">страву видалено з пулу</span>
                  )}
                </span>
              </span>
              <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
                {slotView.meal ? formatMealCalories(slotView.meal) : ''}
              </span>
            </div>
          ))}

          <DayTotal calories={day.calories} plan={planRead.data} />

          {/* MER-33: минулий день — незмінна історія. */}
          {todayKey && date < todayKey ? (
            <Meta>Минулий день — незмінна історія, лише перегляд.</Meta>
          ) : null}
        </>
      )}
    </Panel>
  )
}
