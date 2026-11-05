import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const componentsDir = new URL('./', import.meta.url)

const MOVES_ON_INTERACTION =
  /(?:^|:)(?:active|hover|group-active|group-hover):(?:.*:)?-?(?:scale|translate|rotate)(?:-|$)/
const ANIMATES_TRANSFORM = /(?:^|:)transition(?:-transform|-all)?$/

const unsafeMotionClasses = (source: string) =>
  source
    .split(/[\s"'`]+/)
    .filter(
      (token) =>
        !token.startsWith('motion-safe:') &&
        (MOVES_ON_INTERACTION.test(token) || ANIMATES_TRANSFORM.test(token)),
    )

test('сканер ловить рух без motion-safe і пропускає рух під ним', () => {
  assert.deepEqual(
    unsafeMotionClasses(
      'transition transition-transform active:scale-90 hover:-translate-y-px group-active:scale-90 hover:rotate-45 disabled:hover:translate-y-0',
    ),
    [
      'transition',
      'transition-transform',
      'active:scale-90',
      'hover:-translate-y-px',
      'group-active:scale-90',
      'hover:rotate-45',
      'disabled:hover:translate-y-0',
    ],
  )
  assert.deepEqual(
    unsafeMotionClasses(
      'transition-colors -translate-y-1/2 hover:text-content motion-safe:transition motion-safe:active:scale-90 motion-safe:disabled:hover:translate-y-0',
    ),
    [],
  )
})

test('жоден компонент не рухається на натиск чи наведення без motion-safe', () => {
  const offenders = readdirSync(componentsDir)
    .filter((file) => file.endsWith('.tsx'))
    .flatMap((file) =>
      unsafeMotionClasses(
        readFileSync(new URL(file, componentsDir), 'utf8'),
      ).map((token) => `${file}: ${token}`),
    )
  assert.deepEqual(offenders, [])
})
