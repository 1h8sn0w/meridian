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
import { formatWeekRange } from '../lib/format'
import { useMessages } from '../lib/i18n/use-messages'
import {
  amountText,
  categoryLabel,
  shoppingListText,
} from '../lib/shopping-share'
import { useNow } from '../lib/use-now'
import { AppShell } from './AppShell'
import {
  Button,
  Chip,
  Empty,
  Hint,
  InfoText,
  Meta,
  Panel,
  Problems,
  SectionLabel,
  Warn,
} from './ui'
import { Check, ShareNetwork } from '@phosphor-icons/react'

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
    mealsRead.problems,
    profilesRead.problems,
    weeksRead.problems,
    checksRead.problems,
  ]

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

  const shareText = shoppingListText({
    range: weekRangeOf(weeks),
    withQty,
    noQty,
    checks: checksRead.data,
  })
  const [copied, setCopied] = useState(false)

  const share = async () => {
    setError(null)
    setCopied(false)
    const data = { title: messages.titles.shopping, text: shareText }
    if ('canShare' in navigator && navigator.canShare(data)) {
      try {
        await navigator.share(data)
        return
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      setError(t.shareFailed)
    }
  }

  return (
    <AppShell
      title={messages.titles.shopping}
      subtitle={
        items.length
          ? t.bought(bought, items.length)
          : weekRangeOf(weeks) || t.fromWeek
      }
    >
      <Problems of={problems} />

      {error ? <Warn>{error}</Warn> : null}

      {profiles.length > 1 ? (
        <ScopeChips profiles={profiles} scope={scope} onChange={setScope} />
      ) : null}

      {isLoading ? null : !profiles.length ? (
        <Panel title={messages.common.profileFirst}>
          <Hint>{t.profileFirstHint}</Hint>
        </Panel>
      ) : !weeks.length ? (
        <Panel>
          <Hint>{t.noPlan}</Hint>
          <Link to="/week" className="block no-underline">
            <Button block>{messages.common.openWeekScreen}</Button>
          </Link>
        </Panel>
      ) : (
        <>
          <Panel>
            <Progress bought={bought} total={items.length} />
            <Meta>
              {weekRangeOf(weeks)}
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
                items={withQty}
                checks={checksRead.data}
                onToggle={(item) => void toggle(item)}
              />

              {noQty.length ? (
                <Panel title={t.noQty}>
                  <Hint>{t.noQtyHint}</Hint>
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

function ScopeChips({
  profiles,
  scope,
  onChange,
}: {
  profiles: ReadonlyArray<AppProfile>
  scope: ShoppingScope
  onChange: (next: ShoppingScope) => void
}) {
  const t = useMessages().shopping
  return (
    <Panel>
      <div className="flex flex-wrap gap-2">
        <Chip
          active={scope === ALL_PROFILES}
          onClick={() => onChange(ALL_PROFILES)}
        >
          {profiles.length === 2 ? t.both : t.all}
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
        className="h-full w-full origin-left bg-accent-fill transition-transform duration-700 ease-out-expo"
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
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

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ShoppingItem
  checked: boolean
  onToggle: () => void
}) {
  const t = useMessages().shopping
  const qty = amountText(item)
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={
        item.name + (qty ? ', ' + qty : '') + (checked ? t.boughtMark : '')
      }
      onClick={onToggle}
      className="group flex w-full cursor-pointer items-baseline gap-3 border-0 border-b border-line bg-transparent px-0 py-2.5 text-left text-content last:border-b-0"
    >
      <span
        aria-hidden
        className={`inline-flex h-6 w-6 flex-none items-center justify-center self-center rounded-full border-2 transition duration-300 ease-spring group-active:scale-90 ${
          checked
            ? 'border-transparent bg-accent-fill text-button-ink'
            : 'border-line bg-app'
        }`}
      >
        {checked ? (
          <Check size={14} weight="bold" className="motion-safe:animate-pop" />
        ) : null}
      </span>
      <span
        className={`flex-1 text-sm transition-colors duration-300 ${checked ? 'text-muted line-through' : ''}`}
      >
        {item.name}
      </span>
      {qty ? (
        <span
          className={`whitespace-nowrap font-mono text-xs tabular-nums ${checked ? 'text-subtle line-through' : 'text-muted'}`}
        >
          {qty}
        </span>
      ) : null}
    </button>
  )
}
