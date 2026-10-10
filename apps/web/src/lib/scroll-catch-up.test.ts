import { test } from 'node:test'
import assert from 'node:assert/strict'

import { catchUpScroll } from './scroll-catch-up.ts'

function fakePage(height: number, scrollY = 0) {
  const viewport = 800
  let onResize: (() => void) | null = null
  const listeners = new Map<string, () => void>()
  const win = {
    scrollY,
    innerHeight: viewport,
    scrollTo({ top }: { top: number }) {
      win.scrollY = Math.max(0, Math.min(top, height - viewport))
    },
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    setTimeout,
    clearTimeout,
    ResizeObserver: class {
      callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe() {
        onResize = this.callback
        onResize()
      }
      disconnect() {
        onResize = null
      }
    },
    document: {
      documentElement: {
        get scrollHeight() {
          return height
        },
      },
    },
  }
  return {
    win: win as unknown as Window & typeof globalThis,
    grow(to: number) {
      height = to
      win.scrollY = Math.min(win.scrollY, Math.max(0, height - viewport))
      onResize?.()
    },
    user(type: string) {
      listeners.get(type)?.()
    },
    observing: () => onResize !== null || listeners.size > 0,
  }
}

test('доганяє, доки сторінка не виросте до цілі, і відпускає', () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win)
  assert.equal(page.win.scrollY, 200)

  page.grow(1800)
  assert.equal(page.win.scrollY, 1000)

  page.grow(2400)
  assert.equal(page.win.scrollY, 1500)
  assert.equal(page.observing(), false)

  page.win.scrollY = 300
  page.grow(3000)
  assert.equal(page.win.scrollY, 300)
})

test('людина гортає сама — наздоганяння відступає', () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win)
  assert.equal(page.win.scrollY, 200)

  page.win.scrollY = 120
  page.grow(2400)
  assert.equal(page.win.scrollY, 120)
  assert.equal(page.observing(), false)
})

test('людина торкнулась сторінки — її зміни вже не наші дані', () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win)
  assert.equal(page.win.scrollY, 200)

  page.user('pointerdown')
  page.grow(2400)
  assert.equal(page.win.scrollY, 200)
  assert.equal(page.observing(), false)
})

test('сторінка покоротшала й підтиснула позицію — це не людина, доганяємо далі', () => {
  const page = fakePage(1800)
  catchUpScroll(1500, page.win)
  assert.equal(page.win.scrollY, 1000)

  page.grow(1600)
  assert.equal(page.win.scrollY, 800)
  assert.equal(page.observing(), true)

  page.grow(2400)
  assert.equal(page.win.scrollY, 1500)
})

test('таймаут: вміст так і не виріс — більше не чекаємо', async () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win, 1)
  await new Promise((resolve) => setTimeout(resolve, 20))

  page.grow(2400)
  assert.equal(page.win.scrollY, 200)
})

test('роутер уже відновив або людина вже нижче — не крутимо', () => {
  const restored = fakePage(3000, 1500)
  catchUpScroll(1500, restored.win)
  assert.equal(restored.win.scrollY, 1500)
  assert.equal(restored.observing(), false)

  const below = fakePage(3000, 2000)
  catchUpScroll(1500, below.win)
  assert.equal(below.win.scrollY, 2000)
  assert.equal(below.observing(), false)
})
