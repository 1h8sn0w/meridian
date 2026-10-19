import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  DEFAULT_MEAL_HOURS,
  MEAL_HOUR_MARKS,
  MEAL_HOUR_TYPES,
  formatMinute,
  mealHoursProblems,
  sameMealHours,
} from '../lib/day-clock'
import type { MealHourType, MealHours } from '../lib/day-clock'
import { saveMealHours } from '../lib/data/mutations'
import { useMealWindows } from '../lib/meal-windows'
import { errorText } from '../lib/messages'
import { useMessages } from '../lib/i18n/use-messages'
import { Button, Hint, LinkButton, Meta, Panel, SelectField, Warn } from './ui'

export function MealHoursPanel({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const t = useMessages()
  const { hours, windows } = useMealWindows()
  const [draft, setDraft] = useState<MealHours | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const save = async (next: MealHours) => {
    setBusy(true)
    setFailure(null)
    try {
      await saveMealHours(db, familyId, next)
      setDraft(null)
    } catch (cause) {
      setFailure(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return (
      <Panel title={t.mealHours.title}>
        <Hint>
          {[...windows]
            .sort((a, b) => a.startMinute - b.startMinute)
            .map(
              (w) =>
                t.common.mealType[w.type] +
                ' ' +
                formatMinute(w.startMinute) +
                '–' +
                formatMinute(w.endMinute),
            )
            .join(' · ')}
        </Hint>
        <Button block onClick={() => setDraft(hours ?? DEFAULT_MEAL_HOURS)}>
          {t.mealHours.change}
        </Button>
      </Panel>
    )
  }

  const problems = mealHoursProblems(draft)
  const valid = !Object.keys(problems).length
  const patch = (type: MealHourType, bound: 'start' | 'end', value: string) =>
    setDraft({ ...draft, [type]: { ...draft[type], [bound]: Number(value) } })

  return (
    <Panel title={t.mealHours.title}>
      {MEAL_HOUR_TYPES.map((type) => (
        <fieldset key={type} className="m-0 mb-1 border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-semibold text-content">
            {t.common.mealType[type]}
          </legend>
          <div className="flex gap-2 [&>*]:flex-1">
            <SelectField
              label={t.mealHours.start}
              value={draft[type].start}
              aria-invalid={Boolean(problems[type])}
              onChange={(event) => patch(type, 'start', event.target.value)}
            >
              {MEAL_HOUR_MARKS.slice(0, -1).map((minute) => (
                <option key={minute} value={minute}>
                  {formatMinute(minute)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t.mealHours.end}
              value={draft[type].end}
              aria-invalid={Boolean(problems[type])}
              onChange={(event) => patch(type, 'end', event.target.value)}
            >
              {MEAL_HOUR_MARKS.slice(1).map((minute) => (
                <option key={minute} value={minute}>
                  {formatMinute(minute)}
                </option>
              ))}
            </SelectField>
          </div>
          {problems[type] ? (
            <p className="-mt-1 mb-3 text-sm text-warning" role="alert">
              {problems[type]}
            </p>
          ) : null}
        </fieldset>
      ))}

      <Meta>{t.mealHours.hint}</Meta>

      {failure ? <Warn>{failure}</Warn> : null}

      <div className="mt-3.5 flex gap-2">
        <Button
          variant="primary"
          disabled={busy || !valid}
          onClick={() => void save(draft)}
        >
          {t.mealHours.save}
        </Button>
        <Button disabled={busy} onClick={() => setDraft(null)}>
          {t.mealHours.cancel}
        </Button>
      </div>
      {sameMealHours(draft, DEFAULT_MEAL_HOURS) ? null : (
        <div className="mt-3 text-center">
          <LinkButton
            disabled={busy}
            onClick={() => setDraft(DEFAULT_MEAL_HOURS)}
          >
            {t.mealHours.reset}
          </LinkButton>
        </div>
      )}
    </Panel>
  )
}
