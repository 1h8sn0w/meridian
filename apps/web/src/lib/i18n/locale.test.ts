import { test } from 'node:test'
import assert from 'node:assert/strict'
import { en } from './en.ts'
import { getLocale, intlLocale, messages, pickLocale } from './locale.ts'
import { uk } from './uk.ts'

test('множини uk: 1 день, 2 дні, 5 днів, 11 днів, 21 день', () => {
  assert.deepEqual([1, 2, 5, 11, 21].map(uk.common.days), [
    '1 день',
    '2 дні',
    '5 днів',
    '11 днів',
    '21 день',
  ])
  assert.deepEqual([1, 2, 5, 11, 21].map(uk.search.found), [
    'Знайдено 1 страву',
    'Знайдено 2 страви',
    'Знайдено 5 страв',
    'Знайдено 11 страв',
    'Знайдено 21 страву',
  ])
})

test('множини en: одна форма лише для 1', () => {
  assert.deepEqual([1, 2, 11, 21].map(en.common.days), [
    '1 day',
    '2 days',
    '11 days',
    '21 days',
  ])
})

test('початкова мова — перша підтримувана з мов браузера', () => {
  assert.equal(pickLocale(['en-US', 'uk']), 'en')
  assert.equal(pickLocale(['uk-UA', 'en']), 'uk')
  assert.equal(pickLocale(['de-DE', 'en-GB']), 'en')
})

test('без підтримуваної мови в браузері — українська', () => {
  assert.equal(pickLocale([]), 'uk')
  assert.equal(pickLocale(['fr-FR', 'it']), 'uk')
})

test('браузер із ru отримує українську, а не наступну мову списку', () => {
  assert.equal(pickLocale(['ru-RU', 'en-US']), 'uk')
})

test('без браузера (node) діє українська', () => {
  assert.equal(getLocale(), 'uk')
  assert.equal(messages(), uk)
  assert.equal(intlLocale(), 'uk-UA')
})
