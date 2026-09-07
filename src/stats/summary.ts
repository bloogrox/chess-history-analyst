import type { Game, Speed } from '../db/schema.ts'
import { filterGames, scoreOf } from './filters.ts'
import { openingStats } from './openings.ts'

const TOP = 5

export interface LibrarySummary {
  total: number
  dateFrom: string | null
  dateTo: string | null
  bySpeed: Partial<Record<Speed, number>>
  byColor: { white: number; black: number }
  /** Рейтинг из самой свежей партии, по контролям. */
  ratingNow: Partial<Record<Speed, number>>
  withEvals: number
  analyzed: number
  topFamilies: { name: string; games: number; score: number }[]
}

export function librarySummary(list: Game[]): LibrarySummary {
  const bySpeed: Partial<Record<Speed, number>> = {}
  const ratingNow: Partial<Record<Speed, number>> = {}
  const ratingDate: Partial<Record<Speed, string>> = {}
  const byColor = { white: 0, black: 0 }
  let dateFrom: string | null = null
  let dateTo: string | null = null
  let withEvals = 0
  let analyzed = 0

  for (const g of list) {
    bySpeed[g.speed] = (bySpeed[g.speed] ?? 0) + 1
    byColor[g.userColor]++
    if (g.evalsFromLichess) withEvals++
    if (g.analysis) analyzed++
    if (!dateFrom || g.date < dateFrom) dateFrom = g.date
    if (!dateTo || g.date > dateTo) dateTo = g.date
    if (g.userRating !== null && g.date > (ratingDate[g.speed] ?? '')) {
      ratingDate[g.speed] = g.date
      ratingNow[g.speed] = g.userRating
    }
  }

  const topFamilies = openingStats(list, { groupBy: 'family', minGames: 1 })
    .slice(0, TOP)
    .map(({ name, games, score }) => ({ name, games, score }))

  return { total: list.length, dateFrom, dateTo, bySpeed, byColor, ratingNow, withEvals, analyzed, topFamilies }
}

function topLine(games: Game[]): string {
  const rows = openingStats(games, { groupBy: 'family', minGames: 1 }).slice(0, TOP)
  return rows.length
    ? rows.map((r) => `${r.name} — ${r.games} games, score ${r.score}%`).join('; ')
    : 'no data'
}

/**
 * 10–15 строк для system prompt: модель должна знать, что вообще есть в библиотеке,
 * чтобы не звать инструменты вслепую. Цифры — только те, что дальше подтвердит инструмент.
 */
export function promptSummary(games: Game[]): string {
  const s = librarySummary(games)
  if (!s.total) return 'Library is empty: no games imported yet.'

  const first = games[0]!
  const userName = first.userColor === 'white' ? first.white : first.black
  const speeds = (Object.entries(s.bySpeed) as [Speed, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([speed, count]) => `${speed} ${count}`)
    .join(', ')
  const ratings = (Object.entries(s.ratingNow) as [Speed, number][])
    .sort((a, b) => (s.bySpeed[b[0]] ?? 0) - (s.bySpeed[a[0]] ?? 0))
    .map(([speed, rating]) => `${speed} ${rating}`)
    .join(', ')
  const analyzed = Math.round((s.analyzed / s.total) * 100)

  return [
    `Player: ${userName}.`,
    `Games: ${s.total}, from ${s.dateFrom!.slice(0, 10)} to ${s.dateTo!.slice(0, 10)}.`,
    `Overall score: ${scoreOf(games)}%. White ${s.byColor.white}, Black ${s.byColor.black}.`,
    `Time controls: ${speeds}.`,
    ratings ? `Current rating: ${ratings}.` : 'Rating unknown.',
    `Engine-analyzed: ${s.analyzed} of ${s.total} (${analyzed}%), of which ${s.withEvals} carry Lichess export evals.`,
    `Top openings as White: ${topLine(filterGames(games, { color: 'white' }))}.`,
    `Top openings as Black: ${topLine(filterGames(games, { color: 'black' }))}.`,
  ].join('\n')
}
