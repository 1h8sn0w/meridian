/**
 * Екран «Список покупок» (MER-16 → MER-62).
 *
 * Список збирається з інгредієнтів страв поточних тижневих планів і ніде не
 * зберігається — зберігаються лише позначки «куплено» (`shopping_check`).
 * Збірку робить `aggregate` з ядра, тож правило провенансу (кількість лише
 * там, де вона є в джерелі) описане один раз і перевірене тестами.
 *
 * Три речі, які тут легко зробити «зручніше» й зламати:
 *
 *  - **позначки спільні для сім'ї, а охоплення — ні.** Двоє в магазині бачать
 *    відмітки одне одного (це і є сценарій, заради якого робився sync), але
 *    фільтр «чиї плани» лишається на пристрої (рішення MER-55). Тому відбиток
 *    планів рахується по ВСІХ профілях, незалежно від вибраного охоплення;
 *  - **спільний план сім'ї (MER-17) рахується один раз.** Власник і пов'язані
 *    профілі їдять ті самі страви, і без дедуплікації власників кількості в
 *    списку подвоїлися б;
 *  - **позначка перемикається записом у базу, без локальної копії стану.**
 *    Реактивний запит повертає її назад тим самим шляхом, яким приходить
 *    позначка з іншого телефона — тож обидва випадки виглядають однаково й
 *    другого джерела правди на екрані немає.
 */

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import {
  SHOPPING_CATEGORIES,
  addDays,
  aggregate,
  dateKey,
  planFingerprint,
  planOwnerId,
} from '@meridian/core'
import type { Meal, ShoppingItem } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import { ALL_PROFILES, useShoppingScope } from '../lib/shopping-scope'
import type { ShoppingScope } from '../lib/shopping-scope'
import {
  useMeals,
  useOwnerWeeks,
  useProfiles,
  useShoppingChecks,
} from '../lib/data/queries'
import type { AppProfile } from '../lib/data/model'
import { clearStaleChecks, setShoppingCheck } from '../lib/data/mutations'
import { formatWeekRange, plural } from '../lib/format'
import { useNow } from '../lib/use-now'
import { AppShell } from './AppShell'
import {
  Button,
  Chip,
  Empty,
  Hint,
  Meta,
  Panel,
  SectionLabel,
  Warn,
} from './ui'

export function ShoppingScreen({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const now = useNow()
  const todayKey = now === null ? '' : dateKey(now)

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const profiles = profilesRead.data
  // Сам список сімейний, але акцент інтерфейсу тримає активний профіль — той
  // самий хук, що й на решті екранів. Без нього застосунок, відкритий одразу
  // за цією адресою, лишився б із кольором за замовчуванням.
  useActiveProfile(profiles)
  const { scope, setScope } = useShoppingScope(profiles)

  /* Власники планів без повторів: спільний план фізично один, і пов'язані
   * профілі дають ОДИН запис (інакше кількості подвоїлись би). Порядок —
   * як у списку профілів, тож він стабільний між рендерами. */
  const allOwners = [...new Set(profiles.map(planOwnerId))]
  const weeksRead = useOwnerWeeks(allOwners, mealsRead.data, todayKey)

  /* Страви ще в дорозі — це НЕ «страв немає»: `useMeals` і плани це окремі
   * підписки, і на кадрі між ними кожен слот виглядав би порожнім. Мовчати
   * тут чесніше, ніж показати «28 слотів без страви» для цілого плану. */
  const isLoading =
    mealsRead.isLoading || profilesRead.isLoading || weeksRead.isLoading

  /* Відбиток — по ВСІХ планах сім'ї, а не по вибраному охопленню: позначки
   * спільні, і два пристрої з різним фільтром мусять писати їх під одним
   * відбитком. Рахується зі змісту плану — з клітинок і страв у них
   * (`planFingerprint`), тож однаковий тиждень дає однаковий відбиток на обох
   * пристроях, чиїм би рядком `week_plan` він не був представлений. Порожній —
   * плану ще немає. */
  const fingerprint = planFingerprint(
    weeksRead.data.flatMap((week) =>
      week.days.flatMap((day) =>
        day.slots.map((slotView) => ({
          slotId: slotView.id,
          mealId: slotView.mealId,
        })),
      ),
    ),
  )

  const checksRead = useShoppingChecks(fingerprint)

  /* Позначки минулих походів у магазин прибираємо м'яким видаленням (рішення
   * MER-55): у список вони й так не потрапляють (читання фільтрує за
   * відбитком), але інакше накопичувалися б назавжди. Свіжих рядків це не
   * чіпає — інакше пристрій зі ще не догнаним планом стирав би позначки, які
   * інший щойно зробив (див. `clearStaleChecks`). Доки вибірки в дорозі,
   * відбиток ще неповний, тож і не прибираємо нічого. */
  useEffect(() => {
    if (!fingerprint || isLoading) return
    void clearStaleChecks(db, fingerprint).catch(() => {
      // Прибирання — не те, заради чого користувач сюди прийшов: список від
      // нього не залежить, тож невдача лишається тихою й повториться сама.
    })
  }, [db, fingerprint, isLoading])

  const scopeOwners =
    scope === ALL_PROFILES
      ? allOwners
      : [...new Set(profiles.filter((p) => p.id === scope).map(planOwnerId))]
  const weeks = weeksRead.data.filter((week) =>
    scopeOwners.includes(week.profileId),
  )

  /* Страви беруться СЛОТАМИ, а не унікальним переліком: страва двічі на
   * тиждень — це дві реальні потреби в магазині. */
  const slotMeals: Array<Meal> = []
  let missing = 0
  for (const week of weeks) {
    missing += week.missing
    for (const day of week.days) {
      for (const slot of day.slots) {
        if (slot.meal) slotMeals.push(slot.meal)
      }
    }
  }

  const { withQty, noQty } = aggregate(slotMeals)
  const items = [...withQty, ...noQty]
  const bought = items.filter((item) => checksRead.data.get(item.key)).length

  const problems = [
    ...mealsRead.problems,
    ...profilesRead.problems,
    ...weeksRead.problems,
    ...checksRead.problems,
  ]

  /* Позначка малюється ЛИШЕ з бази — локальної копії стану тут немає навмисно
   * (див. шапку файлу). Тому невдалий запис не просто «не зберігся»: дотик не
   * дав би взагалі нічого, і мовчки. Кажемо про це вголос, як і решта екранів
   * із записами. */
  const [error, setError] = useState<string | null>(null)

  const toggle = async (item: ShoppingItem) => {
    setError(null)
    try {
      await setShoppingCheck(db, familyId, {
        itemKey: item.key,
        fingerprint,
        checked: !checksRead.data.get(item.key),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <AppShell
      title="Список покупок"
      subtitle={
        items.length
          ? `${bought} з ${items.length} куплено`
          : weekRangeOf(weeks) || 'Із поточного тижня'
      }
    >
      {[...new Set(problems)].map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      {error ? <Warn>{error}</Warn> : null}

      {profiles.length > 1 ? (
        <ScopeChips profiles={profiles} scope={scope} onChange={setScope} />
      ) : null}

      {isLoading ? null : !weeks.length ? (
        // «Плану немає» стверджуємо лише тоді, коли всі вибірки вже відповіли.
        <Panel>
          <Hint>
            Плану тижня ще немає. Згенеруйте його на екрані «Тиждень» — список
            збереться з інгредієнтів страв, нічого не вигадуючи.
          </Hint>
          <Link to="/week" className="no-underline">
            <Button block>Відкрити екран «Тиждень»</Button>
          </Link>
        </Panel>
      ) : (
        <>
          <Panel>
            <Progress bought={bought} total={items.length} />
            <Meta>
              {weekRangeOf(weeks)}
              {weeks.length > 1 ? ` · планів: ${weeks.length}` : ''}
            </Meta>
            {/* Дірка в плані (страву видалили з пулу) робить список неповним —
                це видно на екрані «Тиждень», і мовчати про це тут не можна. */}
            {missing > 0 ? (
              <Warn>
                {`${missing} ${plural(missing, 'слот', 'слоти', 'слотів')} без страви — її видалено з пулу, тож її інгредієнтів у списку немає.`}
              </Warn>
            ) : null}
          </Panel>

          {!items.length ? (
            <Panel>
              <Empty>У стравах цього тижня немає інгредієнтів.</Empty>
            </Panel>
          ) : (
            <>
              <Sections
                items={withQty}
                checks={checksRead.data}
                onToggle={(item) => void toggle(item)}
              />

              {noQty.length ? (
                <Panel title="Без точної кількості">
                  <Hint>
                    У плані дієтолога цих кількостей немає — застосунок їх не
                    вигадує.
                  </Hint>
                  <Sections
                    items={noQty}
                    checks={checksRead.data}
                    onToggle={(item) => void toggle(item)}
                    flat
                  />
                </Panel>
              ) : null}
            </>
          )}
        </>
      )}
    </AppShell>
  )
}

/**
 * «14–20 лип. 2026» — межі всіх планів охоплення разом.
 *
 * `addDays` кидає на даті не у форматі «YYYY-MM-DD», а `start_date` у
 * клієнтській схемі — звичайний TEXT. Битий рядок плану має коштувати підпису
 * над списком, а не всього екрана, тож ловимо й лишаємо підпис порожнім.
 */
function weekRangeOf(
  weeks: ReadonlyArray<{ startDate: string; params: { days: number } }>,
): string {
  let from = ''
  let to = ''
  try {
    for (const week of weeks) {
      if (!week.startDate || week.params.days < 1) continue
      const end = addDays(week.startDate, week.params.days - 1)
      if (!from || week.startDate < from) from = week.startDate
      if (!to || end > to) to = end
    }
  } catch {
    return ''
  }
  return from && to ? formatWeekRange(from, to) : ''
}

/* ==========================================================================
 * Охоплення
 * ======================================================================== */

function ScopeChips({
  profiles,
  scope,
  onChange,
}: {
  profiles: ReadonlyArray<AppProfile>
  scope: ShoppingScope
  onChange: (next: ShoppingScope) => void
}) {
  return (
    <Panel>
      <div className="flex flex-wrap gap-2">
        <Chip
          active={scope === ALL_PROFILES}
          onClick={() => onChange(ALL_PROFILES)}
        >
          {profiles.length === 2 ? 'Обидва профілі' : 'Усі профілі'}
        </Chip>
        {profiles.map((profile) => (
          <Chip
            key={profile.id}
            active={scope === profile.id}
            onClick={() => onChange(profile.id)}
          >
            {profile.name}
          </Chip>
        ))}
      </div>
      <Meta>
        Охоплення лишається на цьому пристрої. Позначки «куплено» спільні для
        сім’ї — їх видно на всіх телефонах.
      </Meta>
    </Panel>
  )
}

/* ==========================================================================
 * Позиції
 * ======================================================================== */

/** Прогрес купленого — той самий рядок, що й у підзаголовку, але видимий. */
function Progress({ bought, total }: { bought: number; total: number }) {
  const percent = total ? Math.round((bought / total) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={bought}
      aria-label={`Куплено ${bought} з ${total}`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-line"
    >
      {/* Ширина приходить рантаймом, тож через `style`, а не arbitrary value
          в класі (правило значень у AGENTS.md). */}
      <div className="h-full bg-accent" style={{ width: percent + '%' }} />
    </div>
  )
}

/** Кількість для показу: «120 г» / «4 шт» — лише з реальних сум джерела. */
function amountText(item: ShoppingItem): string {
  if (item.amount === null) return ''
  return (
    item.amount.toLocaleString('uk-UA') + (item.unit ? ' ' + item.unit : '')
  )
}

function Sections({
  items,
  checks,
  onToggle,
  flat = false,
}: {
  items: ReadonlyArray<ShoppingItem>
  checks: ReadonlyMap<string, boolean>
  onToggle: (item: ShoppingItem) => void
  /** Без обгортки-панелі — коли секції вже лежать усередині чужої панелі. */
  flat?: boolean
}) {
  return (
    <>
      {SHOPPING_CATEGORIES.map((category) => {
        const inCategory = items.filter((item) => item.category === category.id)
        if (!inCategory.length) return null
        const rows = inCategory.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            checked={checks.get(item.key) === true}
            onToggle={() => onToggle(item)}
          />
        ))
        return flat ? (
          <section key={category.id}>
            <SectionLabel>{category.label}</SectionLabel>
            {rows}
          </section>
        ) : (
          <Panel key={category.id} title={category.label}>
            {rows}
          </Panel>
        )
      })}
    </>
  )
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ShoppingItem
  checked: boolean
  onToggle: () => void
}) {
  const qty = amountText(item)
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={
        item.name + (qty ? ', ' + qty : '') + (checked ? ' — куплено' : '')
      }
      onClick={onToggle}
      className="flex w-full cursor-pointer items-baseline gap-2.5 border-0 border-b border-line bg-transparent px-0 py-2 text-left text-content last:border-b-0"
    >
      <span
        aria-hidden
        className={`inline-flex h-5 w-5 flex-none items-center justify-center self-center rounded border text-xs ${
          checked ? 'border-accent text-accent' : 'border-line'
        }`}
      >
        {checked ? '✓' : ''}
      </span>
      <span
        className={`flex-1 text-sm ${checked ? 'text-muted line-through' : ''}`}
      >
        {item.name}
      </span>
      {qty ? (
        <span
          className={`whitespace-nowrap text-xs ${checked ? 'text-subtle line-through' : 'text-muted'}`}
        >
          {qty}
        </span>
      ) : null}
    </button>
  )
}
