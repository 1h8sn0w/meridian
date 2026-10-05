/**
 * Стартовий набір страв (MER-77): автозасів і кнопка «Додати стартовий набір».
 *
 * Набір лежить на сервері self-host (infra/README.md), а засів — звичайні
 * записи в локальну базу з виведеними id (`seedStarterMeals`). Звідси правила:
 *
 *  - **Автозасів — один раз на сім'ю.** Сервер пам'ятає, що сім'ю засіяно
 *    (`claim_starter_set`), і страви пише лише той пристрій, який цю позначку
 *    поставив. Очистила сім'я пул — страви самі не повертаються.
 *  - **Формат перевіряється ДО позначки.** Зіпсований файл не «спалює» засів:
 *    після виправлення сім'я отримає набір із наступним відкриттям.
 *  - **Повернути набір — лише явною кнопкою.** Вона додає те, чого в пулі
 *    немає, і не чіпає наявні страви (їх могли відредагувати).
 *  - **Без набору на сервері нічого не змінюється**: кнопки немає, автозасів
 *    мовчить.
 */

import { useEffect, useState } from 'react'
import { usePowerSync } from '@powersync/react'
import { Package } from '@phosphor-icons/react'
import { useAuth } from '../lib/auth'
import { seedStarterMeals } from '../lib/data/mutations'
import type { Failure } from '../lib/messages'
import { useSyncState } from '../lib/powersync/provider'
import {
  claimStarterSet,
  fetchStarterMeals,
  starterStatus,
} from '../lib/starter-set'
import { plural } from '../lib/format'
import { Button, ErrorText, Hint, InfoText } from './ui'

/**
 * Автозасів при першому відкритті сім'ї. Живе в `AppGate` поруч із
 * нагадуваннями: пул має з'явитися, хоч би який екран відкрили першим.
 *
 * Мережі немає — нічого не робить і спробує з наступним відкриттям.
 */
export function StarterSeed() {
  const { familyId, supabase } = useAuth()
  const { db } = useSyncState()

  useEffect(() => {
    if (!db || !supabase || !familyId) return
    let cancelled = false
    const run = async () => {
      const status = await starterStatus(supabase)
      // Скасування перевіряємо раз — на першій відповіді: прибрати ефект можна
      // лише до неї (React StrictMode), далі ланцюжок доходить до кінця сам.
      if (cancelled || !status.ok || status.value !== 'pending') return
      const meals = await fetchStarterMeals(supabase)
      if (!meals.ok) {
        // Людині це покаже кнопка на «Стравах» — вона перевіряє той самий набір.
        console.error(meals.failure.text, meals.failure.detail ?? '')
        return
      }
      // Засів забрано собі — якщо його тепер не записати, інший пристрій його
      // вже не зробить (повернути можна лише кнопкою).
      const claim = await claimStarterSet(supabase)
      if (!claim.ok || !claim.value) return
      await seedStarterMeals(db, familyId, meals.value)
    }
    run().catch((error: unknown) => console.error(error))
    return () => {
      cancelled = true
    }
  }, [db, familyId, supabase])

  return null
}

/**
 * Кнопка «Додати стартовий набір» на порожніх «Стравах». Видно лише тоді, коли
 * набір на сервері є.
 */
export function StarterOffer({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const { supabase } = useAuth()
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [added, setAdded] = useState<number | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void starterStatus(supabase).then((status) => {
      if (!cancelled) setAvailable(status.ok && status.value !== 'none')
    })
    return () => {
      cancelled = true
    }
  }, [supabase])

  if (!available || !supabase) return null

  const add = async () => {
    setBusy(true)
    setFailure(null)
    setAdded(null)
    try {
      const meals = await fetchStarterMeals(supabase)
      if (!meals.ok) {
        setFailure(meals.failure)
        return
      }
      // Позначка — щоб автозасів сім'ї, яку ще не засівали, не повторив те саме.
      await claimStarterSet(supabase)
      setAdded(await seedStarterMeals(db, familyId, meals.value))
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
      <Button block disabled={busy} onClick={() => void add()}>
        <Package aria-hidden size={18} />
        Додати стартовий набір
      </Button>
      <Hint>
        Страви з планів дієтолога, які адміністратор поклав на сервер.
      </Hint>
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
