import { test } from 'node:test'
import assert from 'node:assert/strict'
import { de } from './de.ts'
import { en } from './en.ts'
import { getLocale, intlLocale, messages, pickLocale } from './locale.ts'
import { pl } from './pl.ts'
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

test('множини pl: 1 dzień, 2 dni, 5 dni, 12 dni, 22 dni; 22 dania, але 12 dań', () => {
  assert.deepEqual([1, 2, 5, 12, 22].map(pl.common.days), [
    '1 dzień',
    '2 dni',
    '5 dni',
    '12 dni',
    '22 dni',
  ])
  assert.deepEqual([1, 2, 5, 12, 22].map(pl.search.found), [
    'Znaleziono 1 danie',
    'Znaleziono 2 dania',
    'Znaleziono 5 dań',
    'Znaleziono 12 dań',
    'Znaleziono 22 dania',
  ])
})

test('множини de: одна форма лише для 1', () => {
  assert.deepEqual([1, 2, 21].map(de.common.days), [
    '1 Tag',
    '2 Tage',
    '21 Tage',
  ])
  assert.deepEqual([1, 3].map(de.meals.inPool), [
    '1 Gericht im Pool',
    '3 Gerichte im Pool',
  ])
})

test('початкова мова — перша підтримувана з мов браузера', () => {
  assert.equal(pickLocale(['en-US', 'uk']), 'en')
  assert.equal(pickLocale(['uk-UA', 'en']), 'uk')
  assert.equal(pickLocale(['de-DE', 'en-GB']), 'de')
  assert.equal(pickLocale(['fr-FR', 'pl', 'en']), 'pl')
  assert.equal(pickLocale(['de-AT']), 'de')
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
