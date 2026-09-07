import { expect, test } from 'bun:test'
import { trend } from '../src/stats/trends.ts'
import { makeGame } from './factory.ts'
import { batch, library, makeAnalysis } from './library.ts'

test('партии по месяцам — по одному бакету на пачку', () => {
  expect(trend(library, { metric: 'games', bucket: 'month' })).toEqual([
    { x: '2026-01', y: 12, n: 12 },
    { x: '2026-02', y: 10, n: 10 },
    { x: '2026-03', y: 8, n: 8 },
    { x: '2026-04', y: 6, n: 6 },
    { x: '2026-05', y: 4, n: 4 },
  ])
})

test('счёт по месяцам', () => {
  const points = trend(library, { metric: 'score', bucket: 'month' })
  expect(points[0]).toEqual({ x: '2026-01', y: 41.7, n: 12 }) // 4 + 2·0.5 из 12
  expect(points[4]).toEqual({ x: '2026-05', y: 100, n: 4 })
})

test('рейтинг — последний в бакете, бакеты без рейтинга выпадают', () => {
  const games = [
    makeGame({ id: 'a', date: '2026-06-01T12:00:00Z', userRating: 1800 }),
    makeGame({ id: 'b', date: '2026-06-20T12:00:00Z', userRating: 1875 }),
    makeGame({ id: 'c', date: '2026-06-10T12:00:00Z', userRating: 1830 }),
    makeGame({ id: 'd', date: '2026-07-01T12:00:00Z', userRating: null }),
  ]
  expect(trend(games, { metric: 'rating', bucket: 'month' })).toEqual([
    { x: '2026-06', y: 1875, n: 3 },
  ])
})

test('зевки на партию — только по разобранным', () => {
  const games = [
    ...batch({
      prefix: 'b',
      family: 'X',
      eco: 'A00',
      color: 'white',
      wins: 4,
      draws: 0,
      losses: 0,
      month: '2026-08',
      analyses: [
        makeAnalysis(5, { opening: { blunder: 2 } }),
        makeAnalysis(9, { middlegame: { blunder: 1 }, endgame: { blunder: 2 } }),
      ],
    }),
  ]
  // 5 зевков на 2 разобранные партии; две неразобранные в знаменатель не идут
  expect(trend(games, { metric: 'blunders_per_game', bucket: 'month' })).toEqual([
    { x: '2026-08', y: 2.5, n: 2 },
  ])
  const noAnalysis = games.map((g) => ({ ...g, analysis: null }))
  expect(trend(noAnalysis, { metric: 'blunders_per_game', bucket: 'month' })).toEqual([])
})

test('недели по ISO 8601', () => {
  const games = [
    makeGame({ id: 'a', date: '2026-01-01T12:00:00Z' }), // четверг — 1-я неделя 2026
    makeGame({ id: 'b', date: '2026-01-04T12:00:00Z' }), // воскресенье — та же неделя
    makeGame({ id: 'c', date: '2026-01-05T12:00:00Z' }), // понедельник — уже 2-я
  ]
  expect(trend(games, { metric: 'games', bucket: 'week' })).toEqual([
    { x: '2026-W01', y: 2, n: 2 },
    { x: '2026-W02', y: 1, n: 1 },
  ])
})

test('пустой список', () => {
  expect(trend([], { metric: 'score', bucket: 'month' })).toEqual([])
})
