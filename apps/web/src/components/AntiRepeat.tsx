import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import { DEFAULTS } from '@meridian/core'
import { saveAntiRepeatDays } from '../lib/data/mutations'
import { useAntiRepeatDays } from '../lib/data/queries'
import { errorText } from '../lib/messages'
import { useMessages } from '../lib/i18n/use-messages'
import { Meta, Panel, Problems, SelectField, Warn } from './ui'

const DAY_CHOICES = Array.from({ length: DEFAULTS.days }, (_, i) => i + 1)

export function AntiRepeatPanel({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const t = useMessages()
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
    <Panel title={t.antiRepeat.title}>
      <SelectField
        label={t.antiRepeat.label}
        value={read.data}
        disabled={busy || read.isLoading}
        onChange={(event) => void save(Number(event.target.value))}
      >
        {DAY_CHOICES.map((n) => (
          <option key={n} value={n}>
            {t.common.days(n)}
          </option>
        ))}
      </SelectField>
      <Meta>{t.antiRepeat.hint}</Meta>
      <Problems of={[read.problems]} />
      {failure ? <Warn>{failure}</Warn> : null}
    </Panel>
  )
}
