import { expect, test } from 'bun:test'
import { librarySummary } from '../src/stats/summary.ts'
import { makeGame } from './factory.ts'

const list = [
  makeGame({ id: '1', date: '2026-01-01T00:00:00Z', userResult: 'win', openingFamily: 'Sicilian Defense', speed: 'blitz', userRating: 1800 }),
  makeGame({ id: '2', date: '2026-03-01T00:00:00Z', userResult: 'loss', openingFamily: 'Sicilian Defense', speed: 'blitz', userRating: 1850, userColor: 'black' }),
  makeGame({ id: '3', date: '2026-02-01T00:00:00Z', userResult: 'draw', openingFamily: 'Sicilian Defense', speed: 'rapid', userRating: 1700, evalsFromLichess: true }),
  makeGame({ id: '4', date: '2026-02-15T00:00:00Z', userResult: 'win', openingFamily: 'Italian Game', speed: 'blitz', userRating: 1820, userColor: 'black', analysis: { depth: 0, source: 'lichess', mistakes: [], firstMistakePly: null, countsByPhase: { opening: { inaccuracy: 0, mistake: 0, blunder: 0 }, middlegame: { inaccuracy: 0, mistake: 0, blunder: 0 }, endgame: { inaccuracy: 0, mistake: 0, blunder: 0 } }, avgCpLoss: null } }),
]

test('сводка библиотеки', () => {
  const s = librarySummary(list)
  expect(s.total).toBe(4)
  expect(s.dateFrom).toBe('2026-01-01T00:00:00Z')
  expect(s.dateTo).toBe('2026-03-01T00:00:00Z')
  expect(s.bySpeed).toEqual({ blitz: 3, rapid: 1 })
  expect(s.byColor).toEqual({ white: 2, black: 2 })
  expect(s.ratingNow).toEqual({ blitz: 1850, rapid: 1700 }) // из самой свежей партии контроля
  expect(s.withEvals).toBe(1)
  expect(s.analyzed).toBe(1)
  expect(s.topFamilies).toEqual([
    { name: 'Sicilian Defense', games: 3, score: 50 }, // 1 + 0.5 + 0 из 3
    { name: 'Italian Game', games: 1, score: 100 },
  ])
})

test('пустая библиотека', () => {
  const s = librarySummary([])
  expect(s.total).toBe(0)
  expect(s.dateTo).toBeNull()
  expect(s.topFamilies).toEqual([])
})

test('дата в карточке — как в макете, без «г.»', async () => {
  const { dateLong } = await import('../src/lib/format.ts')
  expect(dateLong('2026-09-03T00:00:00Z')).toBe('3 сентября 2026')
})

test('сводка для system prompt — компактный текст с реальными числами', async () => {
  const { promptSummary } = await import('../src/stats/summary.ts')
  const { library } = await import('./library.ts')
  const text = promptSummary(library)
  const lines = text.split('\n')
  expect(lines.length).toBeGreaterThanOrEqual(8)
  expect(lines.length).toBeLessThanOrEqual(15)
  expect(text).toInclude('Player: petrov77')
  expect(text).toInclude('Games: 40, from 2026-01-01 to 2026-05-04')
  expect(text).toInclude('White 16, Black 24')
  expect(text).toInclude('Time controls: blitz 24, rapid 10, bullet 6')
  expect(text).toInclude('Engine-analyzed: 8 of 40 (20%), of which 8 carry Lichess export evals')
  expect(text).toInclude('Top openings as Black: Sicilian Defense — 12 games, score 41.7%')
  expect(text).toInclude('Caro-Kann Defense — 4 games')
  expect(text).toInclude('Top openings as White: Italian Game — 10 games, score 60%')
})

test('сводка для промпта на пустой библиотеке', async () => {
  const { promptSummary } = await import('../src/stats/summary.ts')
  expect(promptSummary([])).toInclude('Library is empty')
})
