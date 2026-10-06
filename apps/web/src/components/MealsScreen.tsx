/**
 * Екран «Страви» (MER-49) — пул, з якого генератор збирає тиждень.
 *
 * Пул спільний для сім'ї, як і смаки: сім'я планує один раціон. Профіль може
 * бачити лише частину пулу (MER-21), але керується він тут цілком — інакше
 * страву, прибрану з одного профілю, ніхто не зміг би повернути.
 *
 * Позначки «улюблене» / «не подобається» (MER-18) стоять просто в рядку списку: це не косметика,
 * а правило добору в генераторі, і ставити їх має бути так само легко, як
 * подивитися на страву.
 */

import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  formatMealCalories,
} from '@meridian/core'
import type { Meal } from '@meridian/core'
import { prefOf, useMeals, useTastePrefs } from '../lib/data/queries'
import { clearMeals, setMealPref } from '../lib/data/mutations'
import { plural } from '../lib/format'
import type { MealsFilter, MealsSearch } from '../lib/meals-search'
import { AppShell } from './AppShell'
import { MealMarks } from './MealDetails'
import { MealForm } from './MealForm'
import { PdfImportPanel } from './PdfImportPanel'
import { RecipeLink } from './RecipeLink'
import { StarterOffer } from './StarterSet'
import {
  FilePdf,
  Heart,
  PencilSimple,
  Plus,
  Prohibit,
  Trash,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import {
  Button,
  Chip,
  Empty,
  Hint,
  IconButton,
  InfoText,
  Panel,
  Problems,
  Warn,
} from './ui'

export function MealsScreen({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const mealsRead = useMeals()
  const prefsRead = useTastePrefs()
  const search = useSearch({ from: '/meals' })
  const filter = search.filter ?? 'all'
  /* MER-75: «лише ГЕРХ» — окремий перемикач, а не ще одне значення `filter`:
   * його поєднують із типом слота («ГЕРХ-сніданки»). */
  const gerdOnly = search.gerd ?? false
  const navigate = useNavigate({ from: '/meals' })
  /* Фільтр — це той самий екран, а не перехід: без нового запису в історії,
   * без стрибка вгору й без анімації зміни екрана. */
  const setSearch = (next: MealsSearch) =>
    void navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
      resetScroll: false,
      viewTransition: false,
    })
  const [editing, setEditing] = useState<{ meal: Meal | null } | null>(null)
  const [importing, setImporting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [cleared, setCleared] = useState<string | null>(null)

  const meals = mealsRead.data
  const prefs = prefsRead.data

  const gerdCount = meals.filter((meal) => meal.gerd).length

  const shown = meals.filter((meal) => {
    if (gerdOnly && !meal.gerd) return false
    if (filter === 'all') return true
    if (filter === 'favorite') return prefs.favorites.has(meal.id)
    if (filter === 'disliked') return prefs.disliked.has(meal.id)
    return meal.type === filter
  })

  const toggle = async (meal: Meal, value: 'favorite' | 'disliked') => {
    setFailure(null)
    try {
      const current = prefOf(prefs, meal.id)
      await setMealPref(db, familyId, meal.id, current === value ? null : value)
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /* MER-77: усі страви разом із рецептами й смаками. Страви зі слотів планів
   * лишаються — те саме правило, що для видалення однієї (`MealForm`). */
  const clearAll = async () => {
    if (
      !window.confirm(
        'Видалити всі страви з пулу разом із рецептами? Страви, що стоять у ' +
          'планах, лишаться. Стартовий набір потім можна додати знову.',
      )
    ) {
      return
    }
    setFailure(null)
    try {
      const { removed, kept } = await clearMeals(db)
      setCleared(
        'Видалено ' +
          removed +
          ' ' +
          plural(removed, 'страву', 'страви', 'страв') +
          '.' +
          (kept
            ? ' ' +
              kept +
              ' ' +
              plural(kept, 'лишилась', 'лишились', 'лишилось') +
              ', бо стоять у планах: спершу замініть їх або перегенеруйте тиждень.'
            : ''),
      )
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const subtitle = meals.length
    ? meals.length +
      ' ' +
      plural(meals.length, 'страва', 'страви', 'страв') +
      ' у пулі'
    : 'Пул страв порожній'

  if (editing) {
    return (
      <AppShell title="Страви" subtitle={subtitle}>
        <MealForm
          meal={editing.meal}
          familyId={familyId}
          onDone={() => setEditing(null)}
        />
      </AppShell>
    )
  }

  if (importing) {
    return (
      <AppShell title="Страви" subtitle={subtitle}>
        <PdfImportPanel
          familyId={familyId}
          onDone={() => setImporting(false)}
        />
      </AppShell>
    )
  }

  const chips: Array<{
    id: MealsFilter
    label: string
    count: number
    icon?: Icon
  }> = [
    { id: 'all', label: 'Усі', count: meals.length },
    ...MEAL_TYPES.map((type) => ({
      id: type,
      label: MEAL_TYPE_LABELS[type],
      count: meals.filter((meal) => meal.type === type).length,
    })),
    // Фільтр живе в адресі, тож може пережити свої страви: його чип лишається,
    // щоб було видно, що саме вибрано, і як це зняти (так само «Лише ГЕРХ»).
    ...(prefs.favorites.size || filter === 'favorite'
      ? [
          {
            id: 'favorite' as MealsFilter,
            label: 'Улюблені',
            icon: Heart,
            count: prefs.favorites.size,
          },
        ]
      : []),
    ...(prefs.disliked.size || filter === 'disliked'
      ? [
          {
            id: 'disliked' as MealsFilter,
            label: 'Небажані',
            icon: Prohibit,
            count: prefs.disliked.size,
          },
        ]
      : []),
  ]

  return (
    <AppShell title="Страви" subtitle={subtitle}>
      <Problems of={[mealsRead.problems, prefsRead.problems]} />

      <Panel>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Chip
              key={chip.id}
              active={filter === chip.id}
              onClick={() =>
                setSearch({ filter: chip.id === 'all' ? undefined : chip.id })
              }
            >
              {chip.icon ? (
                <chip.icon aria-hidden size={14} weight="fill" />
              ) : null}
              {chip.label}
              {chip.count ? (
                <span className="font-mono tabular-nums opacity-70">
                  {chip.count}
                </span>
              ) : null}
            </Chip>
          ))}
          {gerdCount || gerdOnly ? (
            <Chip
              active={gerdOnly}
              onClick={() => setSearch({ gerd: gerdOnly ? undefined : true })}
            >
              Лише ГЕРХ
              <span className="font-mono tabular-nums opacity-70">
                {gerdCount}
              </span>
            </Chip>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            block
            variant="primary"
            onClick={() => setEditing({ meal: null })}
          >
            <Plus aria-hidden size={18} weight="bold" />
            Додати страву
          </Button>

          {/* Напівавтоматичний імпорт плану дієтолога (MER-52): розпізнане
              людина перевіряє й підтверджує перед додаванням у пул. */}
          <Button block onClick={() => setImporting(true)}>
            <FilePdf aria-hidden size={18} />
            Імпорт із PDF-плану дієтолога
          </Button>
        </div>

        {failure ? <Warn>{failure}</Warn> : null}
        {cleared ? <InfoText>{cleared}</InfoText> : null}

        <div className="mt-4">
          {shown.length === 0 ? (
            <Empty>
              {gerdOnly && meals.length
                ? 'Немає страв із маркером ГЕРХ серед обраних.'
                : filter === 'all'
                  ? 'Поки що жодної страви. Додайте першу вручну — з плану дієтолога.'
                  : filter === 'favorite'
                    ? 'Немає страв із позначкою «улюблене».'
                    : filter === 'disliked'
                      ? 'Немає страв із позначкою «не подобається».'
                      : 'Немає страв цього типу.'}
            </Empty>
          ) : null}

          {shown.map((meal) => {
            const taste = prefOf(prefs, meal.id)
            const calories = formatMealCalories(meal)
            return (
              <div
                key={meal.id}
                className="flex items-center justify-between gap-2 border-b border-line py-3 last:border-b-0 last:pb-0"
              >
                {/* Рядок веде на сторінку рецепта (MER-63): кроки, фото й
                    повний склад. Редагування самої страви лишається на «✎». */}
                <RecipeLink
                  mealId={meal.id}
                  className="group min-w-0 flex-auto text-content no-underline"
                >
                  <div className="text-sm font-medium leading-snug transition-colors group-hover:text-accent">
                    {meal.name} <MealMarks meal={meal} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {/* Калорійність — у рядку під назвою, а не окремою
                        колонкою: на телефоні колонка з'їдала б ширину назви. */}
                    {calories ? (
                      <span className="font-mono font-medium tabular-nums text-accent">
                        {calories}
                      </span>
                    ) : null}
                    {calories ? ' · ' : ''}
                    {MEAL_TYPE_LABELS[meal.type]}
                    {meal.source ? ' · ' + meal.source : ''}
                  </div>
                </RecipeLink>

                <TasteButton
                  icon={Heart}
                  title="Улюблене"
                  on={taste === 'favorite'}
                  tone="accent"
                  onClick={() => void toggle(meal, 'favorite')}
                />
                <TasteButton
                  icon={Prohibit}
                  title="Не подобається"
                  on={taste === 'disliked'}
                  tone="warn"
                  onClick={() => void toggle(meal, 'disliked')}
                />

                <IconButton
                  label={'Редагувати страву «' + meal.name + '»'}
                  onClick={() => setEditing({ meal })}
                >
                  <PencilSimple size={16} />
                </IconButton>
              </div>
            )
          })}
        </div>

        {/* MER-77: стартовий набір, якщо на сервері є страви, яких у пулі
            немає. «Очистити всі» лишає страви з планів, тож кнопка потрібна й
            у непорожньому пулі — це єдиний шлях повернути решту. */}
        {mealsRead.isLoading ? null : (
          <StarterOffer familyId={familyId} meals={meals} />
        )}

        {meals.length ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void clearAll()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-warning bg-transparent px-5 py-3 text-sm font-medium text-warning transition-transform duration-300 ease-spring active:scale-97"
            >
              <Trash aria-hidden size={16} />
              Очистити всі страви
            </button>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <Hint>
          Улюблені страви частіше потрапляють у план, небажані — виключаються.
          Правила дієтолога (тип слота, коридор калорій, антиповтор і мікс
          планів) головніші за смак і ніколи ним не послаблюються.
        </Hint>
      </Panel>
    </AppShell>
  )
}

/**
 * Позначка смаку. Увімкнення «підстрибує» (`pop`) — підтвердження, що
 * натискання дійшло, бо сама іконка змінюється ледь помітно.
 */
function TasteButton({
  icon: Glyph,
  title,
  on,
  tone,
  onClick,
}: {
  icon: Icon
  title: string
  on: boolean
  tone: 'accent' | 'warn'
  onClick: () => void
}) {
  const look = on
    ? tone === 'accent'
      ? 'border-transparent bg-accent-soft text-accent'
      : 'border-transparent bg-warning-soft text-warning'
    : 'border-line bg-app text-subtle hover:text-muted'
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full border p-0 transition duration-300 ease-spring active:scale-90 ${look}`}
    >
      <Glyph
        aria-hidden
        size={16}
        weight={on ? 'fill' : 'regular'}
        className={on ? 'motion-safe:animate-pop' : ''}
      />
    </button>
  )
}
