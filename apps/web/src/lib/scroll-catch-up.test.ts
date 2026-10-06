/**
 * Наздоганяння прокрутки (MER-86): сторінка росте шматками, поки приїжджають
 * дані, і позиція має дійти до цілі — але не смикати людину, що вже гортає.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { catchUpScroll } from './scroll-catch-up.ts'

/** Сторінка без браузера: висота документа й вікно 800 px. */
function fakePage(height: number, scrollY = 0) {
  const viewport = 800
  let onResize: (() => void) | null = null
  const win = {
    scrollY,
    scrollTo({ top }: { top: number }) {
      win.scrollY = Math.max(0, Math.min(top, height - viewport))
    },
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
    document: { documentElement: {} },
  }
  return {
    win: win as unknown as Window & typeof globalThis,
    grow(to: number) {
      height = to
      onResize?.()
    },
    observing: () => onResize !== null,
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

  // Ціль досягнуто — подальший ріст сторінки нічого не крутить.
  page.win.scrollY = 300
  page.grow(3000)
  assert.equal(page.win.scrollY, 300)
})

test('людина гортає сама — наздоганяння відступає', () => {
  const page = fakePage(1000)
  catchUpScroll(1500, page.win)
  assert.equal(page.win.scrollY, 200)

  // Будь-чим: колесом, дотиком, смугою прокрутки — сторінка стала вище.
  page.win.scrollY = 120
  page.grow(2400)
  assert.equal(page.win.scrollY, 120)
  assert.equal(page.observing(), false)
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
