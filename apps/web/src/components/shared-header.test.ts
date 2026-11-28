import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const componentsDir = new URL('./', import.meta.url)
const routesDir = new URL('../routes/', import.meta.url)

const read = (dir: URL, file: string) =>
  readFileSync(new URL(file, dir), 'utf8')

const sources = (dir: URL) =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ file, source: read(dir, file) }))

test('шапка з перемикачем мови — одна на всі екрани, до входу й після', () => {
  const ui = read(componentsDir, 'ui.tsx')
  const header = ui.slice(ui.indexOf('export function ScreenHeader'))
  assert.match(header.slice(0, header.indexOf('\n}\n')), /<LocaleSwitcher \/>/)
  assert.match(ui, /export function AuthShell[\s\S]*?<ScreenHeader /)
  assert.match(
    read(componentsDir, 'AppShell.tsx'),
    /<ScreenHeader[\s\S]*?actions=\{[\s\S]*?<ProfileMenu /,
  )
})

test('у стеку профілів активний диск першим і над усіма, решта — під попереднім', () => {
  const menu = read(componentsDir, 'ProfileMenu.tsx')
  assert.match(menu, /const stack = activeFirst\(/)
  assert.match(
    menu,
    /style=\{\{ zIndex: stack\.length - index \}\}\s+className=\{`relative /,
  )
})

test('інших шапок і заголовків екрана, окрім ScreenHeader, немає', () => {
  const own = [...sources(componentsDir), ...sources(routesDir)].filter(
    ({ file, source }) => file !== 'ui.tsx' && /<(header|h1)\b/.test(source),
  )
  assert.deepEqual(
    own.map(({ file }) => file),
    [],
  )
})
