/**
 * Наздоганяння прокрутки (MER-86): сторінка росте шматками, поки приїжджають
 * дані, і позиція має дійти до цілі — але не смикати людину, що вже гортає.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { catchUpScroll } from './scroll-catch-up.ts'

/** Сторінка без браузера: висота документа, вікно 800 px і слухачі подій. */
function fakePage(height: number) {
  const viewport = 800
  const listeners = new Map<string, () => void>()
  let onResize = () => {}
  const win = {
    scrollY: 0,
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
        onResize = () => {}
      }
    },
    document: { documentElement: {} },
  }
  return {
    win: win as unknown as Window & typeof globalThis,
    grow(to: number) {
      height = to
      onResize()
    },
    user(type: string) {
      listeners.get(type)?.()
    },
    listeners,
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
  assert.equal(page.listeners.size, 0)

  // Ціль досягнуто — подальший ріст сторінки нічого не крутить.
  page.win.scrollY = 300
  page.grow(3000)
  assert.equal(page.win.scrollY, 300)
})

test('ручна прокрутка скасовує наздоганяння', () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win)
  assert.equal(page.win.scrollY, 200)

  page.user('wheel')
  page.grow(2400)
  assert.equal(page.win.scrollY, 200)
  assert.equal(page.listeners.size, 0)
})

test('таймаут: вміст так і не виріс — більше не чекаємо', async () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win, 1)
  await new Promise((resolve) => setTimeout(resolve, 20))

  page.grow(2400)
  assert.equal(page.win.scrollY, 200)
})

test('вже на місці — нічого не підписує', () => {
  const page = fakePage(3000)
  page.win.scrollY = 1500
  catchUpScroll(1500, page.win)
  assert.equal(page.listeners.size, 0)
})
