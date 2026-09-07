import { expect, test } from 'bun:test'
import { filterGames, scoreOf, tally } from '../src/stats/filters.ts'
import { library } from './library.ts'

test('фикстура собрана как задумано', () => {
  expect(library).toHaveLength(40)
})

test('цвет, результат и контроль', () => {
  expect(filterGames(library, { color: 'black' })).toHaveLength(24) // 12 + 8 + 4
  expect(filterGames(library, { color: 'white', result: 'win' })).toHaveLength(9) // 6 + 3
  expect(filterGames(library, { speed: ['rapid', 'bullet'] })).toHaveLength(16)
  expect(filterGames(library, { speed: [] })).toHaveLength(40) // пустой список — не фильтр
})

test('ECO по префиксу, семейство точно, вариант подстрокой', () => {
  expect(filterGames(library, { eco: 'B' })).toHaveLength(16) // B76 + B12
  expect(filterGames(library, { eco: 'b76' })).toHaveLength(12)
  expect(filterGames(library, { openingFamily: 'sicilian defense' })).toHaveLength(12)
  expect(filterGames(library, { openingFamily: 'Sicilian' })).toHaveLength(0) // семейство — точное имя
  expect(filterGames(library, { openingVariation: 'yugoslav' })).toHaveLength(12)
  expect(filterGames(library, { openingVariation: 'najdorf' })).toHaveLength(0)
})

test('границы дат включительны, времени в них не нужно', () => {
  expect(filterGames(library, { dateFrom: '2026-03-01' })).toHaveLength(18) // март и позже
  expect(filterGames(library, { dateTo: '2026-01-12' })).toHaveLength(12) // весь последний день внутри
  expect(filterGames(library, { dateFrom: '2026-02', dateTo: '2026-02' })).toHaveLength(10)
})

test('рейтинг соперника и наличие анализа', () => {
  expect(filterGames(library, { opponentRatingMin: 2000 })).toHaveLength(8) // французская
  expect(filterGames(library, { opponentRatingMax: 1750 })).toHaveLength(10) // итальянская
  expect(filterGames(library, { analyzedOnly: true })).toHaveLength(8) // 5 + 3
})

test('фильтры складываются', () => {
  expect(filterGames(library, { color: 'black', analyzedOnly: true, eco: 'B' })).toHaveLength(5)
})

test('только неразобранные — кандидаты для analyze_games', () => {
  expect(filterGames(library, { unanalyzedOnly: true })).toHaveLength(32) // 40 − 8 разобранных
  expect(filterGames(library, { analyzedOnly: true, unanalyzedOnly: true })).toHaveLength(0)
})

test('счёт и разбивка по результатам', () => {
  const sicilian = filterGames(library, { openingFamily: 'Sicilian Defense' })
  expect(tally(sicilian)).toEqual({ games: 12, wins: 4, draws: 2, losses: 6, score: 41.7 })
  expect(scoreOf([])).toBe(0)
})
