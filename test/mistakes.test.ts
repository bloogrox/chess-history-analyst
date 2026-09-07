import { expect, test } from 'bun:test'
import { mistakeStats } from '../src/stats/mistakes.ts'
import { library } from './library.ts'

// В фикстуре разобрано 8 партий из 40. Ошибки сицилианской:
//   дебют      1 зевок + 1 ошибка
//   миттель    1 зевок + 1 ошибка + 2 неточности
//   эндшпиль   1 зевок + 1 неточность
// итальянской: дебют 1 зевок, эндшпиль 1 ошибка

test('по фазам — знаменатель общий, все разобранные партии', () => {
  const { rows, coverage } = mistakeStats(library, { groupBy: 'phase' })
  expect(coverage).toEqual({ analyzed: 8, total: 40 })
  expect(rows).toEqual([
    { name: 'Дебют', games: 8, inaccuracy: 0, mistake: 1, blunder: 2, total: 3, perGame: 0.38 },
    { name: 'Миттельшпиль', games: 8, inaccuracy: 2, mistake: 1, blunder: 1, total: 4, perGame: 0.5 },
    { name: 'Эндшпиль', games: 8, inaccuracy: 1, mistake: 1, blunder: 1, total: 3, perGame: 0.38 },
  ])
})

test('по видам ошибок', () => {
  const { rows } = mistakeStats(library, { groupBy: 'kind' })
  expect(rows.map((r) => [r.name, r.total])).toEqual([
    ['Зевки', 4],
    ['Ошибки', 3],
    ['Неточности', 3],
  ])
  expect(rows[0]).toMatchObject({ blunder: 4, mistake: 0, inaccuracy: 0, games: 8, perGame: 0.5 })
})

test('по дебютам — только разобранные партии семейства', () => {
  const { rows } = mistakeStats(library, { groupBy: 'family' })
  expect(rows).toEqual([
    { name: 'Sicilian Defense', games: 5, inaccuracy: 3, mistake: 2, blunder: 3, total: 8, perGame: 1.6 },
    { name: 'Italian Game', games: 3, inaccuracy: 0, mistake: 1, blunder: 1, total: 2, perGame: 0.67 },
  ])
})

test('без анализа — пустые строки и честное покрытие', () => {
  const raw = library.map((g) => ({ ...g, analysis: null }))
  const { rows, coverage } = mistakeStats(raw, { groupBy: 'phase' })
  expect(coverage).toEqual({ analyzed: 0, total: 40 })
  expect(rows.every((r) => r.total === 0 && r.perGame === 0)).toBe(true)
  expect(mistakeStats(raw, { groupBy: 'family' }).rows).toEqual([])
})
