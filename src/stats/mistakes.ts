import type { Game, MistakeKind, Phase } from '../db/schema.ts'
import { kindLabel, phaseLabel } from '../lib/format.ts'

export type MistakeGroupBy = 'phase' | 'family' | 'kind'

export interface MistakeRow {
  name: string
  /** Проанализированных партий в знаменателе строки. */
  games: number
  inaccuracy: number
  mistake: number
  blunder: number
  total: number
  /** Ошибок на партию, два знака. */
  perGame: number
}

export interface MistakeStats {
  rows: MistakeRow[]
  coverage: { analyzed: number; total: number }
}

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame']
const KINDS: MistakeKind[] = ['blunder', 'mistake', 'inaccuracy']

const zero = () => ({ inaccuracy: 0, mistake: 0, blunder: 0 })

function row(name: string, games: number, counts: Record<MistakeKind, number>): MistakeRow {
  const total = counts.inaccuracy + counts.mistake + counts.blunder
  return {
    name,
    games,
    ...counts,
    total,
    perGame: games ? Math.round((total / games) * 100) / 100 : 0,
  }
}

/**
 * Ошибки по фазам, дебютам или видам. Считается только по партиям с анализом —
 * `coverage` показывает, какая это доля библиотеки.
 */
export function mistakeStats(
  games: Game[],
  { groupBy }: { groupBy: MistakeGroupBy },
): MistakeStats {
  const analyzed = games.filter((g) => g.analysis)
  const coverage = { analyzed: analyzed.length, total: games.length }

  if (groupBy === 'phase') {
    const counts: Record<Phase, Record<MistakeKind, number>> = {
      opening: zero(),
      middlegame: zero(),
      endgame: zero(),
    }
    for (const g of analyzed)
      for (const phase of PHASES)
        for (const kind of KINDS) counts[phase][kind] += g.analysis!.countsByPhase[phase][kind]
    return { rows: PHASES.map((p) => row(phaseLabel[p], analyzed.length, counts[p])), coverage }
  }

  if (groupBy === 'kind') {
    const counts = zero()
    for (const g of analyzed)
      for (const phase of PHASES)
        for (const kind of KINDS) counts[kind] += g.analysis!.countsByPhase[phase][kind]
    return {
      rows: KINDS.map((kind) => row(kindLabel[kind], analyzed.length, { ...zero(), [kind]: counts[kind] })),
      coverage,
    }
  }

  const byFamily = new Map<string, { games: number; counts: Record<MistakeKind, number> }>()
  for (const g of analyzed) {
    if (!g.openingFamily) continue
    const entry = byFamily.get(g.openingFamily) ?? { games: 0, counts: zero() }
    entry.games++
    for (const phase of PHASES)
      for (const kind of KINDS) entry.counts[kind] += g.analysis!.countsByPhase[phase][kind]
    byFamily.set(g.openingFamily, entry)
  }
  return {
    rows: [...byFamily]
      .map(([name, e]) => row(name, e.games, e.counts))
      .sort((a, b) => b.total - a.total || b.games - a.games || a.name.localeCompare(b.name, 'ru')),
    coverage,
  }
}
