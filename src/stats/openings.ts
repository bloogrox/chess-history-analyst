import type { Game } from '../db/schema.ts'
import { moveLabel } from '../lib/format.ts'
import { tally } from './filters.ts'

export type OpeningGroupBy = 'family' | 'variation' | 'eco'

export interface OpeningRow {
  name: string
  games: number
  wins: number
  draws: number
  losses: number
  score: number
  analyzed: number
  /** Медианный ход первой серьёзной ошибки: «11…». null — анализа нет. */
  firstMistakeMove: string | null
  avgCpLoss: number | null
}

function keyOf(g: Game, groupBy: OpeningGroupBy): string | null {
  if (groupBy === 'eco') return g.eco
  if (groupBy === 'family') return g.openingFamily
  return g.openingVariation ?? g.openingFamily
}

/** Нижний из двух средних: результат — реально сыгранный полуход, а не «средний» между белым и чёрным. */
function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length / 2) - 1]!
}

function mean(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
}

/**
 * Статистика по дебютам. Партии без нужного признака (нет ECO, нет названия) в строки не попадают.
 * Для разбора семейства по вариантам сначала отфильтруйте партии по `openingFamily`.
 */
export function openingStats(
  games: Game[],
  { groupBy, minGames = 5 }: { groupBy: OpeningGroupBy; minGames?: number },
): OpeningRow[] {
  const groups = new Map<string, Game[]>()
  for (const g of games) {
    const key = keyOf(g, groupBy)
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(g)
    else groups.set(key, [g])
  }

  return [...groups]
    .filter(([, list]) => list.length >= minGames)
    .map(([name, list]) => {
      const analyzed = list.filter((g) => g.analysis)
      const firstMistakePly = median(
        analyzed.map((g) => g.analysis!.firstMistakePly).filter((p) => p !== null),
      )
      return {
        name,
        ...tally(list),
        analyzed: analyzed.length,
        firstMistakeMove: firstMistakePly === null ? null : moveLabel(firstMistakePly),
        avgCpLoss: mean(analyzed.map((g) => g.analysis!.avgCpLoss).filter((v) => v !== null)),
      }
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'ru'))
}
