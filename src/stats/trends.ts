import type { Game } from '../db/schema.ts'
import { points } from './filters.ts'

export type TrendMetric = 'score' | 'rating' | 'games' | 'blunders_per_game'
export type Bucket = 'week' | 'month'

export interface TrendPoint {
  /** «2026-03» для месяца, «2026-W12» для недели. */
  x: string
  y: number
  /** Сколько партий стоит за точкой. */
  n: number
}

/** Номер недели по ISO 8601: неделя принадлежит году, в который попадает её четверг. */
function isoWeek(iso: string): string {
  const d = new Date(iso)
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const blunders = (g: Game) =>
  g.analysis
    ? Object.values(g.analysis.countsByPhase).reduce((sum, c) => sum + c.blunder, 0)
    : 0

function valueOf(metric: TrendMetric, list: Game[]): { y: number; n: number } | null {
  if (metric === 'games') return { y: list.length, n: list.length }

  if (metric === 'score') {
    const y = (list.reduce((s, g) => s + points(g), 0) / list.length) * 100
    return { y: Math.round(y * 10) / 10, n: list.length }
  }

  if (metric === 'rating') {
    // последний по времени рейтинг в бакете
    const rated = list.filter((g) => g.userRating !== null).sort((a, b) => a.date.localeCompare(b.date))
    const last = rated.at(-1)
    return last ? { y: last.userRating!, n: rated.length } : null
  }

  const analyzed = list.filter((g) => g.analysis)
  if (!analyzed.length) return null
  const y = analyzed.reduce((s, g) => s + blunders(g), 0) / analyzed.length
  return { y: Math.round(y * 100) / 100, n: analyzed.length }
}

export function trend(
  games: Game[],
  { metric, bucket }: { metric: TrendMetric; bucket: Bucket },
): TrendPoint[] {
  const buckets = new Map<string, Game[]>()
  for (const g of games) {
    const key = bucket === 'month' ? g.date.slice(0, 7) : isoWeek(g.date)
    const list = buckets.get(key)
    if (list) list.push(g)
    else buckets.set(key, [g])
  }

  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([x, list]) => {
      const v = valueOf(metric, list)
      return v ? [{ x, ...v }] : []
    })
}
