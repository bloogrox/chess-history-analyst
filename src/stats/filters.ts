import type { Color, Game, Result, Speed } from '../db/schema.ts'

export interface GameFilter {
  color?: Color
  result?: Result
  speed?: Speed[]
  /** Префикс кода ECO: «B» — всё семейство, «B76» — конкретный код. */
  eco?: string
  /** Точное имя семейства, регистр не важен. Имена берутся из других инструментов. */
  openingFamily?: string
  /** Подстрока в названии варианта, регистр не важен. */
  openingVariation?: string
  /** Границы включительно, достаточно даты: «2026-03» или «2026-03-14». */
  dateFrom?: string
  dateTo?: string
  opponentRatingMin?: number
  opponentRatingMax?: number
  analyzedOnly?: boolean
  unanalyzedOnly?: boolean
}

const lower = (s: string | null) => s?.toLowerCase() ?? ''

export function filterGames(games: Game[], f: GameFilter = {}): Game[] {
  const family = f.openingFamily?.toLowerCase()
  const variation = f.openingVariation?.toLowerCase()
  const eco = f.eco?.toUpperCase()
  // сравниваем префиксы одинаковой длины: «2026-03» ловит весь март,
  // «2026-03-14» — весь этот день, а не всё до его полуночи
  const from = f.dateFrom
  const to = f.dateTo

  return games.filter((g) => {
    if (f.color && g.userColor !== f.color) return false
    if (f.result && g.userResult !== f.result) return false
    if (f.speed?.length && !f.speed.includes(g.speed)) return false
    if (eco && !g.eco?.toUpperCase().startsWith(eco)) return false
    if (family && lower(g.openingFamily) !== family) return false
    if (variation && !lower(g.openingVariation).includes(variation)) return false
    if (from && g.date.slice(0, from.length) < from) return false
    if (to && g.date.slice(0, to.length) > to) return false
    if (f.opponentRatingMin !== undefined && (g.opponentRating ?? -Infinity) < f.opponentRatingMin) return false
    if (f.opponentRatingMax !== undefined && (g.opponentRating ?? Infinity) > f.opponentRatingMax) return false
    if (f.analyzedOnly && !g.analysis) return false
    if (f.unanalyzedOnly && g.analysis) return false
    return true
  })
}

/** Очки пользователя: победа 1, ничья 0.5, поражение 0. */
export const points = (g: Game) => (g.userResult === 'win' ? 1 : g.userResult === 'draw' ? 0.5 : 0)

/** Счёт в процентах с одним знаком, как договорились в §7.1 плана. */
export const scoreOf = (list: Game[]) =>
  list.length ? Math.round((list.reduce((s, g) => s + points(g), 0) / list.length) * 1000) / 10 : 0

export function tally(list: Game[]) {
  return {
    games: list.length,
    wins: list.filter((g) => g.userResult === 'win').length,
    draws: list.filter((g) => g.userResult === 'draw').length,
    losses: list.filter((g) => g.userResult === 'loss').length,
    score: scoreOf(list),
  }
}
