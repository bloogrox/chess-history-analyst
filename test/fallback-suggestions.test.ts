import { expect, test } from 'bun:test'
import { fallbackSuggestions } from '../src/ui/fallback-suggestions.ts'

test('чипы несут id неразобранных из query_games', () => {
  const out = fallbackSuggestions([
    {
      name: 'query_games',
      result: {
        total: 4,
        items: [
          { id: 'a1', analyzed: false },
          { id: 'b2', analyzed: true },
          { id: 'c3', analyzed: false },
          { id: 'd4', analyzed: false },
        ],
      },
    },
  ])
  expect(out[0]).toBe('Разобрать движком партии: a1, c3, d4')
  expect(out).toContain('Показать партии, стоящие за этими цифрами')
})

test('без query_games — только generic', () => {
  expect(fallbackSuggestions([{ name: 'trend', result: {} }])).toEqual([
    'Показать партии, стоящие за этими цифрами',
  ])
  expect(fallbackSuggestions([])).toEqual(['Показать партии, стоящие за этими цифрами'])
})

test('все разобранные — id не тащим', () => {
  const out = fallbackSuggestions([
    { name: 'query_games', result: { items: [{ id: 'x', analyzed: true }] } },
  ])
  expect(out).toEqual(['Показать партии, стоящие за этими цифрами'])
})
