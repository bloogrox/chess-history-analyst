import { Chess } from 'chess.js'
import type { Color, Game } from '../db/schema.ts'
import { moveLabel } from '../lib/format.ts'
import { tally } from './filters.ts'

export interface NextMove {
  /** Ход с номером и цветом: «12…a6». */
  move: string
  san: string
  games: number
  wins: number
  draws: number
  losses: number
  score: number
}

export interface SequenceResult {
  /** Партий, начинающихся с этой последовательности. */
  games: number
  fen: string
  /** Чей ход и какой по счёту: «12…». */
  move: string
  turn: Color
  nextMoves: NextMove[]
  sampleGameIds: string[]
}

const SAMPLE = 10

/** Lichess пишет рокировку буквами, но модель может прислать нули. */
const normalize = (san: string) => san.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O')

/**
 * Что игралось после заданной последовательности ходов и с каким счётом.
 * Бросает исключение, если последовательность невозможна на доске.
 */
export function movesFromSequence(
  games: Game[],
  { moves, color }: { moves: string[]; color?: Color },
): SequenceResult {
  // Сверяемся с партиями каноническим SAN от chess.js: модель шлёт «Bb5»,
  // а в партии записано «Bb5+», и без приведения они бы не совпали.
  const chess = new Chess()
  const sequence = moves.map(normalize).map((san, i) => {
    try {
      return chess.move(san).san
    } catch {
      throw new Error(`Ход ${moveLabel(i, san)} невозможен в этой позиции`)
    }
  })

  const matched = games.filter(
    (g) =>
      (!color || g.userColor === color) &&
      g.moves.length >= sequence.length &&
      sequence.every((san, i) => g.moves[i] === san),
  )

  const ply = sequence.length
  const byNext = new Map<string, Game[]>()
  for (const g of matched) {
    const next = g.moves[ply]
    if (!next) continue // партия закончилась ровно здесь
    const list = byNext.get(next)
    if (list) list.push(g)
    else byNext.set(next, [g])
  }

  return {
    games: matched.length,
    fen: chess.fen(),
    move: moveLabel(ply),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    nextMoves: [...byNext]
      .map(([san, list]) => ({ move: moveLabel(ply, san), san, ...tally(list) }))
      .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san)),
    sampleGameIds: matched.slice(0, SAMPLE).map((g) => g.id),
  }
}
