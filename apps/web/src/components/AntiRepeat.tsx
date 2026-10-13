import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import { DEFAULTS } from '@meridian/core'
import { saveAntiRepeatDays } from '../lib/data/mutations'
import { useAntiRepeatDays } from '../lib/data/queries'
import { plural } from '../lib/format'
import { errorText } from '../lib/messages'
import { Meta, Panel, Problems, SelectField, Warn } from './ui'

const DAY_CHOICES = Array.from({ length: DEFAULTS.days }, (_, i) => i + 1)

export function AntiRepeatPanel({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const read = useAntiRepeatDays()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const save = async (next: number) => {
    setBusy(true)
    setFailure(null)
    try {
      await saveAntiRepeatDays(db, familyId, next)
    } catch (cause) {
      setFailure(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Антиповтор">
      <SelectField
        label="Страва не частіше, ніж раз на"
        value={read.data}
        disabled={busy || read.isLoading}
        onChange={(event) => void save(Number(event.target.value))}
      >
        {DAY_CHOICES.map((n) => (
          <option key={n} value={n}>
            {n + ' ' + plural(n, 'день', 'дні', 'днів')}
          </option>
        ))}
      </SelectField>
      <Meta>
        Правило спільне для всієї сім&apos;ї. Діє з наступної генерації тижня й
        заміни страви; вже складені плани не перераховуються.
      </Meta>
      <Problems of={[read.problems]} />
      {failure ? <Warn>{failure}</Warn> : null}
    </Panel>
  )
}
