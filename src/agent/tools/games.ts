import { z } from 'zod'
import { getEvals } from '../../db/evals.ts'
import { games } from '../../db/games.ts'
import type { Game } from '../../db/schema.ts'
import { moveLabel } from '../../lib/format.ts'
import { firstMistakeMove } from '../../stats/evals.ts'
import { filterGames } from '../../stats/filters.ts'
import { gameFilter, tool } from './schema.ts'

const LIMIT = 20

const sorters: Record<string, (a: Game, b: Game) => number> = {
  date_desc: (a, b) => b.date.localeCompare(a.date),
  date_asc: (a, b) => a.date.localeCompare(b.date),
  cp_loss_desc: (a, b) => (b.analysis?.avgCpLoss ?? -1) - (a.analysis?.avgCpLoss ?? -1),
  rating_diff_asc: (a, b) => (a.ratingDiff ?? 0) - (b.ratingDiff ?? 0),
}

export const queryGamesTool = tool({
  name: 'query_games',
  description:
    'List specific games by filter. Returns at most 20 games with Lichess links. ' +
    'Sort: date_desc / date_asc / cp_loss_desc (highest average loss) / rating_diff_asc (costliest rating losses).',
  schema: z.object({
    ...gameFilter,
    limit: z.number().int().min(1).max(LIMIT).default(10),
    offset: z.number().int().min(0).default(0).describe('Skip the first N by sort — collect a diverse sample deeper than the top'),
    sort: z.enum(['date_desc', 'date_asc', 'cp_loss_desc', 'rating_diff_asc']).default('date_desc'),
  }),
  run: ({ limit, offset, sort, ...filter }) => {
    const matched = filterGames(games.value, filter)
    return {
      total: matched.length,
      items: [...matched]
        .sort(sorters[sort]!)
        .slice(offset, offset + limit)
        .map((g) => ({
          id: g.id,
          url: g.url,
          date: g.date.slice(0, 10),
          color: g.userColor,
          result: g.userResult,
          opening: [g.openingFamily, g.openingVariation].filter(Boolean).join(': ') || null,
          eco: g.eco,
          opponent: g.userColor === 'white' ? g.black : g.white,
          opponentRating: g.opponentRating,
          plyCount: g.plyCount,
          analyzed: Boolean(g.analysis),
          depth: g.analysis?.depth ?? null,
          source: g.analysis?.source ?? null,
          firstMistakeMove: firstMistakeMove(g.analysis),
        })),
    }
  },
})

export const gameDetailsTool = tool({
  name: 'game_details',
  description:
    'Details of one game by id: headers, found mistakes with positions and best moves. ' +
    'Request moves and per-ply evals only when truly needed — they are bulky.',
  schema: z.object({
    gameId: z.string().describe('game id from query_games or moves_from_sequence'),
    includeMoves: z.boolean().default(false),
    includeEvals: z.boolean().default(false),
  }),
  run: async ({ gameId, includeMoves, includeEvals }) => {
    const game = games.value.find((g) => g.id === gameId)
    if (!game) return { error: `Game ${gameId} not found`, hint: 'Take the id from query_games' }

    return {
      id: game.id,
      url: game.url,
      date: game.date.slice(0, 10),
      white: game.white,
      black: game.black,
      whiteElo: game.whiteElo,
      blackElo: game.blackElo,
      color: game.userColor,
      result: game.userResult,
      speed: game.speed,
      timeControl: game.timeControl,
      controlLabel: controlLabel(game),
      eco: game.eco,
      opening: [game.openingFamily, game.openingVariation].filter(Boolean).join(': ') || null,
      termination: game.termination,
      plyCount: game.plyCount,
      analyzed: Boolean(game.analysis),
      depth: game.analysis?.depth ?? null,
      source: game.analysis?.source ?? null,
      avgCpLoss: game.analysis?.avgCpLoss ?? null,
      firstMistakeMove: firstMistakeMove(game.analysis),
      mistakes:
        game.analysis?.mistakes.map((m) => ({
          move: moveLabel(m.ply, m.san),
          kind: m.kind,
          phase: m.phase,
          winPctBefore: m.winPctBefore,
          winPctAfter: m.winPctAfter,
          bestMove: m.bestMove,
          fen: m.fen,
        })) ?? [],
      ...(includeMoves ? { moves: numberedMoves(game.moves) } : {}),
      ...(includeEvals ? { evals: await evalsOf(game) } : {}),
    }
  },
})

/**
 * Человекочитаемый контроль: «bullet 2+1». Сырой TimeControl идёт в секундах
 * («120+1»), и модель регулярно читает его как минуты — label убирает двусмысленность.
 */
function controlLabel(game: Game): string {
  const tc = game.timeControl
  if (!tc || tc === '-') return game.speed
  const [base, inc] = tc.split('+').map(Number)
  if (!Number.isFinite(base)) return game.speed
  const mins = (base as number) / 60
  const baseStr = Number.isInteger(mins) ? String(mins) : String(Math.round(mins * 10) / 10)
  return `${game.speed} ${baseStr}+${Number.isFinite(inc) ? inc : 0}`
}

/** «1. e4 c5 2. Nf3 d6» — так модели проще ссылаться на ход. */
function numberedMoves(moves: string[]): string {
  return moves
    .map((san, ply) => (ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san))
    .join(' ')
}

/** Оценки по полуходам: ход с цветом плюс сотые доли пешки глазами белых. */
async function evalsOf(game: Game) {
  const stored = await getEvals(game.id)
  if (!stored) return []
  return stored.plies.flatMap((e, ply) => {
    const san = game.moves[ply]
    if (!e || !san) return []
    return [{ move: moveLabel(ply, san), cp: 'mate' in e ? (e.mate > 0 ? 10000 : -10000) : e.cp }]
  })
}
