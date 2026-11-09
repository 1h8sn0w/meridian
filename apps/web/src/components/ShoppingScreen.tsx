import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  SHOPPING_CATEGORIES,
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
  SHOPPING_PERIODS,
  inShoppingPeriod,
  useShoppingPeriod,
} from '../lib/shopping-period'
import type { ShoppingPeriod } from '../lib/shopping-period'
import {
  useMeals,
  useOwnerWeeks,
  useProfiles,
  useShoppingChecks,
  useShoppingExtras,
} from '../lib/data/queries'
import type { AppProfile, DayView, ShoppingExtra } from '../lib/data/model'
import {
  addShoppingExtra,
  clearStaleChecks,
  removeShoppingExtra,
  setShoppingCheck,
  setShoppingExtraChecked,
} from '../lib/data/mutations'
import { formatWeekRange } from '../lib/format'
import { useMessages } from '../lib/i18n/use-messages'
import {
  amountText,
  categoryLabel,
  shoppingListText,
} from '../lib/shopping-share'
import { shareOrCopy } from '../lib/share'
import { useNow } from '../lib/use-now'
import { AppShell } from './AppShell'
import {
  Button,
  ButtonLink,
  Chip,
  Empty,
  Hint,
  IconButton,
  InfoText,
  Meta,
  Panel,
  Problems,
  SectionLabel,
  Warn,
} from './ui'
import { CaretDown, Check, Plus, ShareNetwork, X } from '@phosphor-icons/react'

export function ShoppingScreen({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const messages = useMessages()
  const t = messages.shopping
  const todayKey = dateKey(useNow())

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const profiles = profilesRead.data
  useActiveProfile(profiles)
  const { scope, setScope } = useShoppingScope(profiles)
  const { period, setPeriod } = useShoppingPeriod()

  const allOwners = [...new Set(profiles.map(planOwnerId))]
  const weeksRead = useOwnerWeeks(allOwners, mealsRead.data, todayKey)

  const isLoading =
    mealsRead.isLoading ||
    profilesRead.isLoading ||
    weeksRead.isLoading ||
    weeksRead.data.some((week) => week.days.length === 0)

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
  const extrasRead = useShoppingExtras()

  useEffect(() => {
    if (!fingerprint || isLoading) return
    void clearStaleChecks(db, fingerprint).catch(() => {})
  }, [db, fingerprint, isLoading])

  const scopeOwners =
    scope === ALL_PROFILES
      ? allOwners
      : [...new Set(profiles.filter((p) => p.id === scope).map(planOwnerId))]
  const weeks = weeksRead.data.filter((week) =>
    scopeOwners.includes(week.profileId),
  )

  const days = weeks.flatMap((week) =>
    week.days.filter((day) => inShoppingPeriod(day.date, period, todayKey)),
  )
  const range = rangeOf(days)

  const slotMeals: Array<Meal> = []
  let missing = 0
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.meal) slotMeals.push(slot.meal)
      else missing += 1
    }
  }

  const { withQty, noQty } = aggregate(slotMeals)
  const items = [...withQty, ...noQty]
  const boughtItems = items.filter((item) => checksRead.data.get(item.key))
  const toBuy = (list: ReadonlyArray<ShoppingItem>) =>
    list.filter((item) => !checksRead.data.get(item.key))
  const noQtyToBuy = toBuy(noQty)
  const extras = extrasRead.data
  const extrasToBuy = extras.filter((extra) => !extra.checked)
  const extrasBought = extras.filter((extra) => extra.checked)
  const total = items.length + extras.length
  const bought = boughtItems.length + extrasBought.length

  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    weeksRead.problems,
    checksRead.problems,
    extrasRead.problems,
  ]

  const [error, setError] = useState<string | null>(null)

  const toggle = (item: ShoppingItem) =>
    write(() =>
      setShoppingCheck(db, familyId, {
        itemKey: item.key,
        fingerprint,
        checked: !checksRead.data.get(item.key),
      }),
    )

  const write = async (work: () => Promise<void>) => {
    setError(null)
    try {
      await work()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const extraActions = {
    onToggle: (extra: ShoppingExtra) =>
      void write(() => setShoppingExtraChecked(db, extra.id, !extra.checked)),
    onRemove: (extra: ShoppingExtra) =>
      void write(() => removeShoppingExtra(db, extra.id)),
  }

  const shareText = shoppingListText({
    range,
    withQty,
    noQty,
    checks: checksRead.data,
    extras,
  })
  const [copied, setCopied] = useState(false)

  const share = async () => {
    setError(null)
    setCopied(false)
    const outcome = await shareOrCopy({
      title: messages.titles.shopping,
      text: shareText,
    })
    if (outcome === 'copied') setCopied(true)
    if (outcome === 'failed') setError(messages.common.shareFailed)
  }

  return (
    <AppShell
      title={messages.titles.shopping}
      subtitle={total ? t.bought(bought, total) : range || t.fromWeek}
    >
      <Problems of={problems} />

      {error ? <Warn>{error}</Warn> : null}

      {profiles.length > 1 || weeksRead.data.length ? (
        <ListFilters
          profiles={profiles}
          scope={scope}
          onScope={setScope}
          period={period}
          showPeriod={weeksRead.data.length > 0}
          onPeriod={setPeriod}
        />
      ) : null}

      {isLoading ? null : (
        <>
          {!profiles.length ? (
            <Panel title={messages.common.profileFirst}>
              <Hint>{t.profileFirstHint}</Hint>
            </Panel>
          ) : !weeks.length ? (
            <Panel>
              <Hint>{t.noPlan}</Hint>
              <ButtonLink to="/week" block>
                {messages.common.openWeekScreen}
              </ButtonLink>
            </Panel>
          ) : !days.length ? (
            <Panel>
              <Empty>{t.periodEmpty}</Empty>
            </Panel>
          ) : (
            <>
              <Panel>
                <Progress bought={bought} total={total} />
                <Meta>
                  {range}
                  {weeks.length > 1 ? t.plans(weeks.length) : ''}
                </Meta>
                {missing > 0 ? <Warn>{t.missing(missing)}</Warn> : null}
                {shareText ? (
                  <div className="mt-3.5">
                    <Button block onClick={() => void share()}>
                      <ShareNetwork aria-hidden size={18} />
                      {t.share}
                    </Button>
                    {copied ? <InfoText>{t.copied}</InfoText> : null}
                  </div>
                ) : null}
              </Panel>

              {!items.length ? (
                <Panel>
                  <Empty>{t.noIngredients}</Empty>
                </Panel>
              ) : (
                <>
                  <Sections
                    items={toBuy(withQty)}
                    checked={false}
                    onToggle={(item) => void toggle(item)}
                  />

                  {noQtyToBuy.length ? (
                    <Panel title={t.noQty}>
                      <Hint>{t.noQtyHint}</Hint>
                      <Sections
                        items={noQtyToBuy}
                        checked={false}
                        onToggle={(item) => void toggle(item)}
                        flat
                      />
                    </Panel>
                  ) : null}
                </>
              )}
            </>
          )}

          <ExtrasPanel
            extras={extrasToBuy}
            onAdd={(name) =>
              void write(() => addShoppingExtra(db, familyId, name))
            }
            {...extraActions}
          />

          {bought ? (
            <Panel>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                  {t.boughtBlock(bought)}
                  <CaretDown
                    aria-hidden
                    size={18}
                    className="flex-none text-muted duration-300 ease-spring group-open:rotate-180 motion-safe:transition-transform"
                  />
                </summary>
                <Sections
                  items={boughtItems}
                  checked
                  onToggle={(item) => void toggle(item)}
                  flat
                />
                {extrasBought.length ? (
                  <section>
                    <SectionLabel>{t.extra}</SectionLabel>
                    <ExtraRows extras={extrasBought} {...extraActions} />
                  </section>
                ) : null}
              </details>
            </Panel>
          ) : null}
        </>
      )}
    </AppShell>
  )
}

function rangeOf(days: ReadonlyArray<DayView>): string {
  const dates = days.map((day) => day.date).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  return from && to ? formatWeekRange(from, to) : ''
}

function ListFilters({
  profiles,
  scope,
  onScope,
  period,
  showPeriod,
  onPeriod,
}: {
  profiles: ReadonlyArray<AppProfile>
  scope: ShoppingScope
  onScope: (next: ShoppingScope) => void
  period: ShoppingPeriod
  showPeriod: boolean
  onPeriod: (next: ShoppingPeriod) => void
}) {
  const t = useMessages().shopping
  return (
    <Panel>
      <div className="flex flex-col gap-3">
        {showPeriod ? (
          <div
            role="group"
            aria-label={t.periodGroup}
            className="flex flex-wrap gap-2"
          >
            {SHOPPING_PERIODS.map((option) => (
              <Chip
                key={option}
                active={period === option}
                onClick={() => onPeriod(option)}
              >
                {t.period[option]}
              </Chip>
            ))}
          </div>
        ) : null}
        {profiles.length > 1 ? (
          <div
            role="group"
            aria-label={t.scopeGroup}
            className="flex flex-wrap gap-2"
          >
            <Chip
              active={scope === ALL_PROFILES}
              onClick={() => onScope(ALL_PROFILES)}
            >
              {profiles.length === 2 ? t.both : t.all}
            </Chip>
            {profiles.map((profile) => (
              <Chip
                key={profile.id}
                active={scope === profile.id}
                onClick={() => onScope(profile.id)}
              >
                {profile.name}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
      <Meta>{t.scopeHint}</Meta>
    </Panel>
  )
}

function Progress({ bought, total }: { bought: number; total: number }) {
  const t = useMessages().shopping
  const percent = total ? Math.round((bought / total) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={bought}
      aria-label={t.progress(bought, total)}
      className="h-2 w-full overflow-hidden rounded-full bg-app"
    >
      <div
        className="h-full w-full origin-left bg-accent-fill motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out-expo"
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  )
}

function Sections({
  items,
  checked,
  onToggle,
  flat = false,
}: {
  items: ReadonlyArray<ShoppingItem>
  checked: boolean
  onToggle: (item: ShoppingItem) => void
  flat?: boolean
}) {
  return (
    <>
      {SHOPPING_CATEGORIES.map((category) => {
        const inCategory = items.filter((item) => item.category === category.id)
        if (!inCategory.length) return null
        const rows = inCategory.map((item) => (
          <CheckRow
            key={item.key}
            name={item.name}
            qty={amountText(item)}
            checked={checked}
            onToggle={() => onToggle(item)}
          />
        ))
        return flat ? (
          <section key={category.id}>
            <SectionLabel>{categoryLabel(category)}</SectionLabel>
            {rows}
          </section>
        ) : (
          <Panel key={category.id} title={categoryLabel(category)}>
            {rows}
          </Panel>
        )
      })}
    </>
  )
}

function ExtrasPanel({
  extras,
  onAdd,
  onToggle,
  onRemove,
}: {
  extras: ReadonlyArray<ShoppingExtra>
  onAdd: (name: string) => void
  onToggle: (extra: ShoppingExtra) => void
  onRemove: (extra: ShoppingExtra) => void
}) {
  const t = useMessages().shopping
  const [name, setName] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onAdd(name)
    setName('')
  }

  return (
    <Panel title={t.extra}>
      <Hint>{t.extraHint}</Hint>
      <form onSubmit={submit} className="mb-1 mt-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={t.extraField}
          placeholder={t.extraPlaceholder}
          enterKeyHint="done"
          autoComplete="off"
          className="block min-w-0 flex-1 rounded-2xl border border-line bg-app px-3.5 py-2.5 text-base text-content transition-colors duration-200 focus:border-accent"
        />
        <IconButton type="submit" label={t.extraAdd} disabled={!name.trim()}>
          <Plus aria-hidden size={16} weight="bold" />
        </IconButton>
      </form>
      <ExtraRows extras={extras} onToggle={onToggle} onRemove={onRemove} />
    </Panel>
  )
}

function ExtraRows({
  extras,
  onToggle,
  onRemove,
}: {
  extras: ReadonlyArray<ShoppingExtra>
  onToggle: (extra: ShoppingExtra) => void
  onRemove: (extra: ShoppingExtra) => void
}) {
  const t = useMessages().shopping
  return extras.map((extra) => (
    <CheckRow
      key={extra.id}
      name={extra.name}
      checked={extra.checked}
      onToggle={() => onToggle(extra)}
    >
      <IconButton
        label={t.extraRemove(extra.name)}
        onClick={() => onRemove(extra)}
      >
        <X aria-hidden size={14} weight="bold" />
      </IconButton>
    </CheckRow>
  ))
}

function CheckRow({
  name,
  qty = '',
  checked,
  onToggle,
  children,
}: {
  name: string
  qty?: string
  checked: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  const t = useMessages().shopping
  return (
    <div className="flex items-center gap-2 border-b border-line last:border-b-0">
      <button
        type="button"
        aria-pressed={checked}
        aria-label={
          name + (qty ? ', ' + qty : '') + (checked ? t.boughtMark : '')
        }
        onClick={onToggle}
        className="group flex min-w-0 flex-1 cursor-pointer items-baseline gap-3 border-0 bg-transparent px-0 py-2.5 text-left text-content"
      >
        <span
          aria-hidden
          className={`inline-flex h-6 w-6 flex-none items-center justify-center self-center rounded-full border-2 transition-colors duration-300 motion-safe:transition motion-safe:ease-spring motion-safe:group-active:scale-90 ${
            checked
              ? 'border-transparent bg-accent-fill text-button-ink'
              : 'border-line bg-app'
          }`}
        >
          {checked ? <Check size={14} weight="bold" /> : null}
        </span>
        <span
          className={`flex-1 break-words text-sm ${checked ? 'text-muted line-through' : ''}`}
        >
          {name}
        </span>
        {qty ? (
          <span
            className={`whitespace-nowrap font-mono text-xs tabular-nums ${checked ? 'text-subtle line-through' : 'text-muted'}`}
          >
            {qty}
          </span>
        ) : null}
      </button>
      {children}
    </div>
  )
}
