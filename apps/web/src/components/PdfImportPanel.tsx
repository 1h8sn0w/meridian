/**
 * Імпорт плану дієтолога з PDF (MER-15 → MER-52).
 *
 * Шлях той самий, що у V1: файл → текст (pdf.js) → розпізнавання
 * (`parsePlanText`, чиста функція ядра) → **екран перевірки**, де людина
 * бачить кожну страву поруч із сирим текстом і підтверджує чи править перед
 * додаванням у пул. Автоматичного «імпортувати все» тут немає й не буде: у
 * раціон їде те, що людина підтвердила.
 *
 * Три речі, які легко зламати рефакторингом:
 *
 *  - **Без калорійності страва в пул не йде.** У PDF її здебільшого немає, а
 *    на ній тримається коридор генератора (MER-10). Нуль тут був би вигаданим
 *    числом у медичних даних, тож картка просто не імпортується, доки цифру не
 *    впишуть.
 *  - **Кроки з плану — це рецепт, а не страва.** `steps` і `servings` лежать у
 *    таблиці `recipe` (MER-22), тож пишуться другим викликом, після страви.
 *  - **Текст плану архівується окремо й вимагає мережі** (`archivePlanSource`,
 *    таблиця поза синхронізацією). Страви від цього не залежать: вони вже в
 *    локальній базі. Але змовчати про невдалий архів не можна.
 */

import { useMemo, useRef, useState } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  parsePlanText,
  planEntryKey,
} from '@meridian/core'
import type { MealType, PlanEntry, PlanParse } from '@meridian/core'
import { useAuth } from '../lib/auth'
import { useMeals } from '../lib/data/queries'
import { insertMeal, saveRecipe } from '../lib/data/mutations'
import { archivePlanSource } from '../lib/data/pdf-import'
import { extractPdfText } from '../lib/pdf-text'
import {
  ingredientsFromText,
  ingredientsToText,
  numberFromField,
  portionsFromText,
  portionsToText,
} from '../lib/meal-text'
import { plural } from '../lib/format'
import {
  Button,
  Empty,
  Field,
  Hint,
  InfoText,
  Panel,
  SelectField,
  Tag,
  TextField,
  Warn,
} from './ui'

/** Поля картки перевірки — рядками, як їх бачить і править людина. */
type Draft = {
  name: string
  type: MealType
  calories: string
  servings: string
  source: string
  ingredients: string
  portions: string
  steps: string
}

type Card = {
  entry: PlanEntry
  draft: Draft
  checked: boolean
  /** Уже додано в пул — картка більше не бере участі в наступному натисканні. */
  added: boolean
  error: string | null
  /** Позначки розбору плюс «така страва вже є в пулі» — разом, як у V1. */
  flags: Array<string>
}

/** Розібраний текст разом із тим, звідки він узявся — для архіву. */
type Source = { fileName: string | null; text: string }

function draftOf(entry: PlanEntry): Draft {
  return {
    name: entry.name,
    type: entry.type,
    calories: entry.calories === null ? '' : String(entry.calories),
    servings: entry.servings === null ? '' : String(entry.servings),
    source: entry.source,
    ingredients: ingredientsToText(entry.ingredients),
    portions: portionsToText(entry.portions),
    steps: entry.steps.join('\n'),
  }
}

/**
 * Картки з розбору. `inPool` — ключі страв, які вже є: такі типово не
 * позначені, як і дублікати всередині самого тексту. `poolKnown` — чи пул
 * узагалі вдалося прочитати; якщо ні, не позначено нічого.
 *
 * Повтори лишаються в списку, хоч у пул і не йдуть: екран перевірки існує саме
 * для того, щоб бачити розібране поруч із сирим текстом, а блок, який мовчки
 * зник, читався б як загублений плану кусок.
 */
function cardsOf(
  parsed: PlanParse,
  inPool: ReadonlySet<string>,
  poolKnown: boolean,
): Array<Card> {
  return parsed.entries.map((entry) => {
    const known =
      entry.kind !== 'repeat' &&
      inPool.has(planEntryKey(entry.name, entry.type))
    return {
      entry,
      draft: draftOf(entry),
      checked: poolKnown && entry.kind === 'meal' && !known,
      added: false,
      error: null,
      flags: [
        ...entry.flags.map((flag) => flag.message),
        ...(known
          ? ['Така страва вже є в пулі — типово не імпортується.']
          : []),
      ],
    }
  })
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function PdfImportPanel({
  familyId,
  onDone,
}: {
  familyId: string
  onDone: () => void
}) {
  const db = usePowerSync()
  const { supabase } = useAuth()
  const pool = useMeals()

  const [source, setSource] = useState<Source | null>(null)
  const [cards, setCards] = useState<Array<Card> | null>(null)
  const [stats, setStats] = useState<PlanParse['stats'] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  /** Чи текст цього розбору вже лежить у `pdf_import`. */
  const [archived, setArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  /**
   * MER-39: токен активної операції. Читання PDF асинхронне, і його результат
   * має право показати лише той запуск, який досі актуальний, — інакше
   * скасований імпорт відтворив би екран перевірки поверх нового.
   */
  const op = useRef(0)
  /** Захист від двох одночасних записів в архів — стан гонки, а не рендеру. */
  const archiving = useRef(false)

  /* Закриття скасовує читання, що триває (MER-39): інакше pdf.js домелює всі
   * сторінки в нікуди, а документ у воркері звільниться лише в кінці. */
  const close = () => {
    op.current++
    onDone()
  }

  const inPool = useMemo(
    () => new Set(pool.data.map((meal) => planEntryKey(meal.name, meal.type))),
    [pool.data],
  )

  const review = (text: string, fileName: string | null) => {
    const parsed = parsePlanText(text)
    setSource({ fileName, text })
    /* Пул не прочитався — типово не позначаємо нічого: порожній `inPool`
     * виглядає точно як «жодної такої страви ще немає», і одне натискання
     * подвоїло б увесь пул. */
    setCards(cardsOf(parsed, inPool, pool.problems.length === 0))
    setStats(parsed.stats)
    setStatus(null)
    setProblem(null)
  }

  const readPdf = async (file: File) => {
    const token = ++op.current
    const stale = () => token !== op.current
    setProblem(null)
    setStatus('Читаю «' + file.name + '»…')
    try {
      const text = await extractPdfText(
        await file.arrayBuffer(),
        (page, total) => {
          if (!stale()) {
            setStatus('Витягаю текст: сторінка ' + page + ' з ' + total + '…')
          }
        },
        stale,
      )
      if (stale()) return
      if (!text || !text.replace(/\s+/g, '')) {
        throw new Error('У файлі не знайдено тексту (можливо, це скан).')
      }
      review(text, file.name)
    } catch (error) {
      if (stale()) return
      setStatus(null)
      setProblem('Не вдалося прочитати PDF: ' + describe(error))
    }
  }

  const patch = (index: number, part: Partial<Draft>) =>
    setCards(
      (current) =>
        current?.map((card, i) =>
          i === index ? { ...card, draft: { ...card.draft, ...part } } : card,
        ) ?? null,
    )

  const check = (index: number, checked: boolean) =>
    setCards(
      (current) =>
        current?.map((card, i) =>
          i === index ? { ...card, checked } : card,
        ) ?? null,
    )

  /**
   * Додати позначені страви.
   *
   * Пишемо по одній і по одній звітуємо: одна картка без калорійності не має
   * скасовувати решту (так само поводився V1). Спільної транзакції тут нема за
   * чим — кожна страва самостійна, а часткового стану, який виглядав би як
   * зіпсована база, не буває.
   */
  const confirm = async () => {
    if (!cards || !source) return
    setBusy(true)
    setProblem(null)

    /* Назад у стан кладемо не знімок карток, а лише наслідки запису. Поля на
     * час запису й так заблоковані, але зливати знімок означало б тримати цю
     * обіцянку на самому лише `disabled` — знімок мовчки відкотив би будь-яку
     * правку, що просочилася повз нього. */
    const outcomes = new Map<number, Partial<Card>>()
    let added = 0
    let failed = 0

    for (const [index, card] of cards.entries()) {
      if (card.added || !card.checked) continue
      const draft = card.draft
      const name = draft.name.trim()
      const calories = numberFromField(draft.calories)
      const servings = numberFromField(draft.servings)

      /* Провенанс: калорійності в PDF здебільшого немає — її вписує людина, і
       * без неї страва в пул не йде. Нуль замість неї був би вигаданим числом
       * у медичних даних (AGENTS.md). */
      const invalid = !name
        ? "Назва страви обов'язкова."
        : draft.calories.trim() === ''
          ? 'Впишіть калорійність — у PDF її немає, а без неї страва не потрапить у пул.'
          : calories === null
            ? 'Калорійність має бути числом — приберіть із поля все, крім цифр.'
            : calories < 0
              ? "Калорійність має бути невід'ємним числом."
              : draft.servings.trim() !== '' &&
                  (servings === null || servings < 1)
                ? 'Порції — ціле число від 1 або порожньо.'
                : null
      if (invalid !== null || calories === null) {
        outcomes.set(index, { error: invalid })
        failed++
        continue
      }

      try {
        const mealId = await insertMeal(db, familyId, {
          name,
          type: draft.type,
          calories: Math.round(calories),
          // БЖВ у плані немає (літери Ж/Ч — це порції), і вигадувати їх нема з
          // чого: лишаються порожніми, доки їх не впишуть на екрані страви.
          protein: null,
          fat: null,
          carbs: null,
          ingredients: ingredientsFromText(draft.ingredients),
          source: draft.source.trim(),
          portions: portionsFromText(draft.portions),
        })
        /* Страва вже в базі — картка закрита незалежно від того, що станеться
         * з рецептом. Інакше невдалий другий запис виглядав би як «не додалося»,
         * і повторне натискання вставило б ту саму страву вдруге. */
        outcomes.set(index, { added: true, checked: false, error: null })
        added++

        const steps = draft.steps
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
        if (steps.length || servings !== null) {
          try {
            await saveRecipe(db, familyId, mealId, {
              steps,
              // Часу приготування план не дає — колонка лишається порожньою.
              prepTime: null,
              servings: servings === null ? null : Math.round(servings),
              photo: null,
            })
          } catch (error) {
            outcomes.set(index, {
              added: true,
              checked: false,
              error:
                'Страву додано, але кроки й порційність не збереглися: ' +
                describe(error),
            })
          }
        }
      } catch (error) {
        outcomes.set(index, { error: describe(error) })
        failed++
      }
    }

    setCards(
      (current) =>
        current?.map((card, i) => {
          const outcome = outcomes.get(i)
          return outcome ? { ...card, ...outcome } : card
        }) ?? null,
    )
    setStatus(
      (added
        ? 'Додано до пулу: ' +
          added +
          ' ' +
          plural(added, 'страва', 'страви', 'страв') +
          '. '
        : '') +
        (failed
          ? 'Не додано: ' + failed + ' — див. позначки в картках.'
          : added
            ? 'Готово.'
            : 'Нічого не вибрано.'),
    )

    // Архівуємо лише те джерело, з якого справді щось узяли.
    if (added) await archive()

    setBusy(false)
  }

  /**
   * Покласти текст плану в `pdf_import` — рівно один раз на розбір, інакше
   * друге натискання «Додати» подвоїло б рядок.
   *
   * Помилка тут не скасовує імпорт: страви вже в локальній базі й нікуди звідти
   * не подінуться. Але й змовчати про неї не можна — уся користь таблиці в
   * тому, щоб завжди було видно, з чого зроблено страви, тож екран пропонує
   * повторити, коли мережа з'явиться.
   */
  const archive = async () => {
    if (!source || archived || archiving.current) return
    archiving.current = true
    try {
      if (!supabase) throw new Error('Сервер Supabase не налаштований.')
      await archivePlanSource(supabase, familyId, source.fileName, source.text)
      setArchived(true)
      setProblem(null)
    } catch (error) {
      setProblem(
        'Страви додано, але текст плану не збережено в архів імпортів — для ' +
          'цього потрібна мережа. ' +
          describe(error),
      )
    } finally {
      archiving.current = false
    }
  }

  const restart = () => {
    op.current++
    setArchived(false)
    setSource(null)
    setCards(null)
    setStats(null)
    setStatus(null)
    setProblem(null)
    setPaste('')
  }

  if (!cards || !stats) {
    return (
      <Panel title="Імпорт із PDF-плану дієтолога">
        <Hint>
          Розпізнаємо лише те, що буквально є у файлі: назви, тип прийому,
          інгредієнти, номер тижня, калорійність — де вказана. Чого в PDF немає,
          те лишиться порожнім. Перед додаванням у пул усе перевіряєте й
          підтверджуєте ви.
        </Hint>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Скидаємо значення, щоб той самий файл можна було вибрати вдруге.
            event.target.value = ''
            if (file) void readPdf(file)
          }}
          className="block w-full cursor-pointer rounded-lg border border-line bg-app px-2.5 py-2 text-sm text-content scheme-dark"
        />

        {status ? <InfoText>{status}</InfoText> : null}
        {problem ? <Warn>{problem}</Warn> : null}

        <div className="mt-3">
          <TextField
            label="Або вставте текст, скопійований із PDF"
            rows={6}
            value={paste}
            placeholder={'День 1\nСніданок: …'}
            onChange={(event) => setPaste(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              disabled={!paste.replace(/\s+/g, '')}
              onClick={() => {
                op.current++ // вставлений текст витісняє читання PDF у польоті
                review(paste, null)
              }}
            >
              Розпізнати текст
            </Button>
            <Button onClick={close}>Скасувати</Button>
          </div>
        </div>
      </Panel>
    )
  }

  const pending = cards.filter((card) => !card.added && card.checked).length

  return (
    <Panel title="Перевірка перед додаванням">
      <Hint>
        Розпізнано страв: {stats.meals}
        {stats.repeats ? ' · повторів між днями: ' + stats.repeats : ''}
        {stats.dups ? ' · дублікатів назв: ' + stats.dups : ''}
        {stats.weeks ? ' · тижнів: ' + stats.weeks : ''}
        {stats.days ? ' · днів: ' + stats.days : ''}. Повтори («Той самий…») до
        пулу не додаються — окрема страва вже є вище. Сумнівні місця мають
        позначки, сирий текст плану — під кожною карткою.
      </Hint>

      {/* Пул не прочитався — тоді жодна картка не позначена, і сказати про це
          треба прямо: інакше порожній екран виглядав би як «нічого нового». */}
      {pool.problems.map((issue) => (
        <Warn key={issue}>
          Не вдалося прочитати пул страв, тож нічого не позначено наперед —
          перевірте кожну картку самі. {issue}
        </Warn>
      ))}

      {cards.length === 0 ? (
        <Empty>
          У тексті не розпізнано жодної страви. Перевірте, що це план із рядками
          «Сніданок: …», «Обід: …».
        </Empty>
      ) : null}

      {cards.map((card, index) => (
        <ReviewCard
          key={index}
          card={card}
          busy={busy}
          onCheck={(checked) => check(index, checked)}
          onPatch={(part) => patch(index, part)}
        />
      ))}

      {status ? <InfoText>{status}</InfoText> : null}
      {problem ? <Warn>{problem}</Warn> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!archived && cards.some((card) => card.added) ? (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void archive().finally(() => setBusy(false))
            }}
          >
            Зберегти текст плану в архів
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={busy || pending === 0}
          onClick={() => void confirm()}
        >
          {busy ? 'Додаємо…' : 'Додати вибрані до пулу (' + pending + ')'}
        </Button>
        <Button disabled={busy} onClick={restart}>
          Інший файл
        </Button>
        <Button disabled={busy} onClick={close}>
          Закрити
        </Button>
      </div>
    </Panel>
  )
}

function ReviewCard({
  card,
  busy,
  onCheck,
  onPatch,
}: {
  card: Card
  /** Триває запис — правити картку зараз означало б правити те, що вже пишеться. */
  busy: boolean
  onCheck: (checked: boolean) => void
  onPatch: (part: Partial<Draft>) => void
}) {
  const { draft, entry } = card

  /* Повтор — довідка, а не кандидат: окрема страва вже є вище, і другий рядок
   * у пулі був би тією самою стравою під тією самою назвою. Полів для правки
   * тут немає навмисно — правити нема чого. */
  if (entry.kind === 'repeat') {
    return (
      <div className="mb-2.5 rounded-xl border border-line px-3 py-2.5 opacity-70">
        <p className="m-0 text-sm text-muted">
          {MEAL_TYPE_LABELS[entry.type]}
          {entry.day ? ' · День ' + entry.day : ''} — повтор
          {entry.name ? ': ' + entry.name : ''}
        </p>
        <RawText entry={entry} />
      </div>
    )
  }

  return (
    <div
      className={`mb-2.5 rounded-xl border border-line px-3 py-2.5 ${
        card.added ? 'opacity-60' : ''
      }`}
    >
      <label className="mb-2 flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={card.checked}
          disabled={card.added || busy}
          onChange={(event) => onCheck(event.target.checked)}
        />
        <span className="text-muted">
          {MEAL_TYPE_LABELS[entry.type]}
          {entry.day ? ' · День ' + entry.day : ''}
          {card.added ? ' · уже в пулі' : ''}
        </span>
      </label>

      <Field
        label="Назва"
        disabled={busy}
        value={draft.name}
        onChange={(event) => onPatch({ name: event.target.value })}
      />
      <SelectField
        label="Тип слота"
        disabled={busy}
        value={draft.type}
        onChange={(event) => onPatch({ type: event.target.value as MealType })}
      >
        {MEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {MEAL_TYPE_LABELS[type]}
          </option>
        ))}
      </SelectField>
      <Field
        label="Калорійність, ккал"
        disabled={busy}
        inputMode="numeric"
        placeholder="немає в PDF"
        value={draft.calories}
        onChange={(event) => onPatch({ calories: event.target.value })}
      />
      <Field
        label="Порції"
        disabled={busy}
        inputMode="numeric"
        placeholder="—"
        value={draft.servings}
        onChange={(event) => onPatch({ servings: event.target.value })}
      />
      <Field
        label="Джерело (план дієтолога)"
        disabled={busy}
        value={draft.source}
        onChange={(event) => onPatch({ source: event.target.value })}
      />
      <TextField
        label="Інгредієнти (по одному в рядку)"
        disabled={busy}
        rows={Math.min(6, Math.max(2, entry.ingredients.length))}
        value={draft.ingredients}
        onChange={(event) => onPatch({ ingredients: event.target.value })}
      />
      <TextField
        label="Готова порція Ж/Ч (складник — до « — »)"
        disabled={busy}
        rows={Math.min(4, Math.max(2, entry.portions.length))}
        value={draft.portions}
        onChange={(event) => onPatch({ portions: event.target.value })}
      />
      <TextField
        label="Кроки/нотатки з плану (по одному в рядку)"
        disabled={busy}
        rows={Math.min(4, Math.max(2, entry.steps.length))}
        value={draft.steps}
        onChange={(event) => onPatch({ steps: event.target.value })}
      />

      {card.error ? <Warn>{card.error}</Warn> : null}

      {card.flags.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {card.flags.map((flag) => (
            <Tag key={flag} tone="warn">
              {flag}
            </Tag>
          ))}
        </div>
      ) : null}

      <RawText entry={entry} />
    </div>
  )
}

/** Сирий текст блоку — те, з чим людина звіряє розпізнане. */
function RawText({ entry }: { entry: PlanEntry }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted">
        Сирий текст із плану
      </summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-app px-2.5 py-2 font-mono text-xs text-subtle">
        {entry.raw.join('\n')}
      </pre>
    </details>
  )
}
