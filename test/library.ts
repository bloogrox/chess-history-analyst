import type { Analysis, Color, Game, MistakeKind, Phase, Speed } from '../src/db/schema.ts'
import { makeGame } from './factory.ts'

const zero = () => ({ inaccuracy: 0, mistake: 0, blunder: 0 })

export function makeAnalysis(
  firstMistakePly: number | null,
  counts: Partial<Record<Phase, Partial<Record<MistakeKind, number>>>> = {},
  avgCpLoss: number | null = null,
): Analysis {
  const byPhase = { opening: zero(), middlegame: zero(), endgame: zero() }
  for (const [phase, kinds] of Object.entries(counts))
    Object.assign(byPhase[phase as Phase], kinds)
  return {
    depth: 0,
    source: 'lichess',
    mistakes: [],
    firstMistakePly,
    countsByPhase: byPhase,
    avgCpLoss,
  }
}

export interface BatchSpec {
  prefix: string
  family: string
  variation?: string
  eco: string
  color: Color
  wins: number
  draws: number
  losses: number
  speed?: Speed
  /** Все партии пачки в этом месяце, по дню на партию. */
  month: string
  rating?: number
  opponentRating?: number
  /** Разборы, по одному на первые N партий пачки. */
  analyses?: Analysis[]
}

/** Пачка партий с заранее известным раскладом — чтобы ожидания в тестах считались руками. */
export function batch(spec: BatchSpec): Game[] {
  const results = [
    ...Array<'win'>(spec.wins).fill('win'),
    ...Array<'draw'>(spec.draws).fill('draw'),
    ...Array<'loss'>(spec.losses).fill('loss'),
  ]
  return results.map((userResult, i) =>
    makeGame({
      id: `${spec.prefix}-${i}`,
      date: `${spec.month}-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
      userColor: spec.color,
      userResult,
      speed: spec.speed ?? 'blitz',
      eco: spec.eco,
      openingFamily: spec.family,
      openingVariation: spec.variation ?? null,
      userRating: spec.rating ?? 1900,
      opponentRating: spec.opponentRating ?? 1900,
      white: spec.color === 'white' ? 'petrov77' : 'rival',
      black: spec.color === 'white' ? 'rival' : 'petrov77',
      analysis: spec.analyses?.[i] ?? null,
      evalsFromLichess: Boolean(spec.analyses?.[i]),
    }),
  )
}

/**
 * 40 партий с известным составом:
 *  12 Sicilian Defense чёрными  (4/2/6 → счёт 41.7), 5 разобраны
 *  10 Italian Game белыми       (6/0/4 → счёт 60),   3 разобраны
 *   8 French Defense чёрными    (2/2/4 → счёт 37.5), 0 разобрано
 *   6 Ruy Lopez белыми          (3/0/3 → счёт 50),   0 разобрано
 *   4 Caro-Kann Defense чёрными (4/0/0 → счёт 100),  0 разобрано — отсекается при minGames = 5
 */
export const library: Game[] = [
  ...batch({
    prefix: 'sic',
    family: 'Sicilian Defense',
    variation: 'Dragon Variation, Yugoslav Attack',
    eco: 'B76',
    color: 'black',
    wins: 4,
    draws: 2,
    losses: 6,
    month: '2026-01',
    rating: 1800,
    analyses: [
      makeAnalysis(21, { opening: { blunder: 1 } }, 30),
      makeAnalysis(21, { middlegame: { blunder: 1, inaccuracy: 2 } }, 40),
      makeAnalysis(19, { opening: { mistake: 1 } }, 50),
      makeAnalysis(23, { middlegame: { mistake: 1 } }, 60),
      makeAnalysis(25, { endgame: { blunder: 1, inaccuracy: 1 } }, 70),
    ],
  }),
  ...batch({
    prefix: 'ita',
    family: 'Italian Game',
    eco: 'C50',
    color: 'white',
    wins: 6,
    draws: 0,
    losses: 4,
    speed: 'rapid',
    month: '2026-02',
    rating: 1850,
    opponentRating: 1700,
    analyses: [
      makeAnalysis(10, { opening: { blunder: 1 } }, 20),
      makeAnalysis(null, {}, 10),
      makeAnalysis(40, { endgame: { mistake: 1 } }, 35),
    ],
  }),
  ...batch({
    prefix: 'fre',
    family: 'French Defense',
    eco: 'C02',
    color: 'black',
    wins: 2,
    draws: 2,
    losses: 4,
    month: '2026-03',
    rating: 1820,
    opponentRating: 2100,
  }),
  ...batch({
    prefix: 'ruy',
    family: 'Ruy Lopez',
    eco: 'C65',
    color: 'white',
    wins: 3,
    draws: 0,
    losses: 3,
    speed: 'bullet',
    month: '2026-04',
    rating: 1870,
  }),
  ...batch({
    prefix: 'car',
    family: 'Caro-Kann Defense',
    eco: 'B12',
    color: 'black',
    wins: 4,
    draws: 0,
    losses: 0,
    month: '2026-05',
    rating: 1890,
  }),
]
