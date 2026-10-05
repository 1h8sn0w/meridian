/**
 * Стартовий набір страв (MER-77): автозасів і кнопка «Додати стартовий набір».
 *
 * Набір лежить на сервері self-host (infra/README.md), а засів — звичайні
 * записи в локальну базу з виведеними id (`seedStarterMeals`). Порядок кроків і
 * рішення «засівати чи ні» — у `lib/starter-set.ts` (`autoSeed`); тут лише
 * прив'язка до бази, сесії й екрана. Правила:
 *
 *  - **Автозасів — один раз на сім'ю й лише в порожній пул.** Сім'я, що
 *    завела страви до появи набору, отримує тільки кнопку. Очистила сім'я пул —
 *    страви самі не повертаються.
 *  - **Нічого не вирішуємо до першої синхронізації**: до неї пул пристрою
 *    порожній, хоч би що лежало на сервері, і засів переписав би правки.
 *  - **Позначка — після запису, формат — до нього.** Зіпсований чи порожній
 *    набір засіву не «спалює».
 *  - **Кнопка додає відсутні**: живих страв не чіпає (їх могли відредагувати),
 *    м'яко видалені оживляє. Видно її, коли в наборі є страви, яких у пулі
 *    немає, — і в непорожньому пулі теж.
 *  - **Без набору на сервері нічого не змінюється**: кнопки немає, автозасів
 *    мовчить.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePowerSync, useStatus } from '@powersync/react'
import type { CommonPowerSyncDatabase } from '@powersync/web'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Meal } from '@meridian/core'
import { Package } from '@phosphor-icons/react'
import { useAuth } from '../lib/auth'
import { seedStarterMeals } from '../lib/data/mutations'
import type { Failure } from '../lib/messages'
import { useSyncState } from '../lib/powersync/provider'
import {
  autoSeed,
  claimStarterSet,
  fetchStarterMeals,
  markSeeded,
  missingStarterMeals,
  rememberSeeded,
  seededHere,
  starterStatus,
} from '../lib/starter-set'
import type { SeedSteps, StarterFetch } from '../lib/starter-set'
import { plural } from '../lib/format'
import { Button, ErrorText, Hint, InfoText } from './ui'

function seedSteps(
  db: CommonPowerSyncDatabase,
  supabase: SupabaseClient,
  familyId: string,
  signal: AbortSignal,
): SeedSteps {
  return {
    cancelled: () => signal.aborted,
    seededHere: () => seededHere(familyId),
    rememberSeeded: () => rememberSeeded(familyId),
    // Скасування завершує очікування — далі `autoSeed` перевіряє `cancelled`.
    firstSync: () => db.waitForFirstSync(signal),
    status: () => starterStatus(supabase),
    poolHasMeals: async () =>
      (await db.getOptional(
        'SELECT 1 FROM meal WHERE deleted_at IS NULL LIMIT 1',
      )) !== null,
    fetchMeals: () => fetchStarterMeals(supabase),
    write: (meals) => seedStarterMeals(db, familyId, meals),
    claim: () => claimStarterSet(supabase),
  }
}

/**
 * Автозасів при першому відкритті сім'ї. Живе в `AppGate` поруч із
 * нагадуваннями: пул має з'явитися, хоч би який екран відкрили першим.
 *
 * Мережі немає — нічого не робить і спробує з наступним відкриттям. Вийшов
 * користувач чи змінив сім'ю — ланцюжок зупиняється на найближчому кроці.
 */
export function StarterSeed() {
  const { familyId, supabase } = useAuth()
  const { db } = useSyncState()

  useEffect(() => {
    if (!db || !supabase || !familyId) return
    const stop = new AbortController()
    autoSeed(seedSteps(db, supabase, familyId, stop.signal)).catch(
      (error: unknown) => console.error(error),
    )
    return () => stop.abort()
  }, [db, familyId, supabase])

  return null
}

/**
 * Кнопка «Додати стартовий набір» на «Стравах». Видно лише після першої
 * синхронізації й лише тоді, коли в наборі є страви, яких у пулі немає.
 */
export function StarterOffer({
  familyId,
  meals,
}: {
  familyId: string
  meals: ReadonlyArray<Meal>
}) {
  const db = usePowerSync()
  const { hasSynced } = useStatus()
  const { supabase } = useAuth()
  const [set, setSet] = useState<StarterFetch | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [added, setAdded] = useState<number | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!supabase || !hasSynced) return
    let cancelled = false
    fetchStarterMeals(supabase).then(
      (result) => {
        if (!cancelled) setSet(result)
      },
      (error: unknown) => console.error(error),
    )
    return () => {
      cancelled = true
    }
  }, [hasSynced, supabase])

  const missing = useMemo(
    () =>
      set?.ok
        ? missingStarterMeals(
            familyId,
            set.value,
            new Set(meals.map((meal) => meal.id)),
          )
        : [],
    [familyId, meals, set],
  )

  if (!hasSynced || !supabase || !set) return null
  // Мережа впала — кнопки просто немає; зіпсований файл — кажемо чесно.
  if (!set.ok)
    return 'broken' in set ? <ErrorText failure={set.failure} /> : null
  if (!missing.length && added === null) return null

  const add = async () => {
    setBusy(true)
    setFailure(null)
    setAdded(null)
    try {
      // Увесь набір, а не `missing`: живі страви запис перевіряє сам, у
      // транзакції, і їх не чіпає.
      setAdded(await seedStarterMeals(db, familyId, set.value))
      await markSeeded({
        cancelled: () => !alive.current,
        claim: () => claimStarterSet(supabase),
        rememberSeeded: () => rememberSeeded(familyId),
      })
    } catch (cause) {
      setFailure({
        text: 'Не вдалося додати стартовий набір.',
        detail: String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      {missing.length ? (
        <>
          <Button block disabled={busy} onClick={() => void add()}>
            <Package aria-hidden size={18} />
            Додати стартовий набір
          </Button>
          <Hint>
            {meals.length
              ? 'Страви з планів дієтолога, яких у пулі немає: ' +
                missing.length +
                '. Наявні страви не зміняться.'
              : 'Страви з планів дієтолога, які адміністратор поклав на сервер.'}
          </Hint>
        </>
      ) : null}
      {failure ? <ErrorText failure={failure} /> : null}
      {added !== null ? (
        <InfoText>
          {added
            ? 'Додано ' +
              added +
              ' ' +
              plural(added, 'страву', 'страви', 'страв') +
              '.'
            : 'Усі страви набору вже в пулі.'}
        </InfoText>
      ) : null}
    </div>
  )
}
