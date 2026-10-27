import { test } from 'node:test'
import assert from 'node:assert/strict'

import { shareOrCopy } from './share.ts'
import type { ShareTarget } from './share.ts'

const data = { title: 'Меню', text: '• Обід — Борщ' }

function target({
  canShare = true,
  share = async () => {},
  clipboard = true,
}: {
  canShare?: boolean
  share?: () => Promise<void>
  clipboard?: boolean | (() => Promise<void>)
} = {}) {
  const calls: Array<string> = []
  const fake: ShareTarget = {
    canShare: () => canShare,
    share: async () => {
      calls.push('share')
      await share()
    },
    clipboard:
      clipboard === false
        ? undefined
        : {
            writeText: async (text) => {
              calls.push('copy:' + text)
              if (typeof clipboard === 'function') await clipboard()
            },
          },
  }
  return { fake, calls }
}

test('системне меню є — ділимося через нього й нічого не копіюємо', async () => {
  const { fake, calls } = target()
  assert.equal(await shareOrCopy(data, fake), 'shared')
  assert.deepEqual(calls, ['share'])
})

test('людина закрила меню — це не помилка й не копія', async () => {
  const { fake, calls } = target({
    share: async () => {
      throw new DOMException('closed', 'AbortError')
    },
  })
  assert.equal(await shareOrCopy(data, fake), 'cancelled')
  assert.deepEqual(calls, ['share'])
})

test('меню відмовило з іншої причини — текст іде в буфер обміну', async () => {
  const { fake, calls } = target({
    share: async () => {
      throw new DOMException('denied', 'NotAllowedError')
    },
  })
  assert.equal(await shareOrCopy(data, fake), 'copied')
  assert.deepEqual(calls, ['share', 'copy:' + data.text])
})

test('браузер не вміє ділитися таким текстом — одразу копія', async () => {
  const { fake, calls } = target({ canShare: false })
  assert.equal(await shareOrCopy(data, fake), 'copied')
  assert.deepEqual(calls, ['copy:' + data.text])
})

test('ні меню, ні буфера обміну — невдача, а не мовчання', async () => {
  assert.equal(
    await shareOrCopy(data, target({ canShare: false, clipboard: false }).fake),
    'failed',
  )
  assert.equal(
    await shareOrCopy(
      data,
      target({
        canShare: false,
        clipboard: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      }).fake,
    ),
    'failed',
  )
  assert.equal(await shareOrCopy(data, {}), 'failed')
})
