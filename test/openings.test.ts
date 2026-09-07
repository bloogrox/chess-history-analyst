import { expect, test } from 'bun:test'
import { openingStats } from '../src/stats/openings.ts'
import { filterGames } from '../src/stats/filters.ts'
import { library } from './library.ts'

test('по семействам — ручной подсчёт по фикстуре', () => {
  const rows = openingStats(library, { groupBy: 'family' })
  // Caro-Kann (4 партии) отсечён порогом minGames = 5
  expect(rows.map((r) => [r.name, r.games])).toEqual([
    ['Sicilian Defense', 12],
    ['Italian Game', 10],
    ['French Defense', 8],
    ['Ruy Lopez', 6],
  ])
  expect(rows[0]).toEqual({
    name: 'Sicilian Defense',
    games: 12,
    wins: 4,
    draws: 2,
    losses: 6,
    score: 41.7,
    analyzed: 5,
    firstMistakeMove: '11…', // медиана из 19, 21, 21, 23, 25
    avgCpLoss: 50, // среднее из 30, 40, 50, 60, 70
  })
  expect(rows[2]!.analyzed).toBe(0)
  expect(rows[2]!.firstMistakeMove).toBeNull()
  expect(rows[2]!.avgCpLoss).toBeNull()
})

test('первая ошибка отдаётся ходом с цветом, а не номером полухода', () => {
  const [sicilian] = openingStats(library, { groupBy: 'family' })
  expect(sicilian!.firstMistakeMove).toBe('11…') // 21-й полуход — 11-й ход чёрных
  const [italian] = openingStats(filterGames(library, { color: 'white' }), { groupBy: 'family' })
  expect(italian!.firstMistakeMove).toBe('6.') // из 10 и 40 берём нижнюю середину — 10-й полуход
})

test('minGames меняет порог', () => {
  expect(openingStats(library, { groupBy: 'family', minGames: 4 })).toHaveLength(5)
  expect(openingStats(library, { groupBy: 'family', minGames: 11 })).toHaveLength(1)
})

test('по ECO и по вариантам', () => {
  expect(openingStats(library, { groupBy: 'eco', minGames: 1 }).map((r) => r.name)).toEqual([
    'B76',
    'C50',
    'C02',
    'C65',
    'B12',
  ])
  // вариант разбирают внутри семейства — фильтром
  const sicilian = filterGames(library, { openingFamily: 'Sicilian Defense' })
  expect(openingStats(sicilian, { groupBy: 'variation' })).toEqual([
    expect.objectContaining({ name: 'Dragon Variation, Yugoslav Attack', games: 12, score: 41.7 }),
  ])
})

test('партии без нужного признака в строки не попадают', () => {
  const noEco = library.map((g) => ({ ...g, eco: null }))
  expect(openingStats(noEco, { groupBy: 'eco', minGames: 1 })).toEqual([])
})
