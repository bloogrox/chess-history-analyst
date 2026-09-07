import { z } from 'zod'
import { games } from '../../db/games.ts'
import { filterGames } from '../../stats/filters.ts'
import { mistakeStats } from '../../stats/mistakes.ts'
import { openingStats } from '../../stats/openings.ts'
import { movesFromSequence } from '../../stats/sequence.ts'
import { trend } from '../../stats/trends.ts'
import { gameFilter, tool } from './schema.ts'

const num = (key: string, label: string) => ({ key, label, align: 'right' as const })

export const openingStatsTool = tool({
  name: 'opening_stats',
  description:
    'Score by opening: games, wins/draws/losses, score percent, first serious mistake move, ' +
    'average loss in centipawns. Group by family, variation, or ECO. ' +
    'To break a family into variations, set openingFamily and groupBy=variation.',
  schema: z.object({
    ...gameFilter,
    groupBy: z.enum(['family', 'variation', 'eco']).default('family'),
    minGames: z.number().int().min(1).max(200).default(5).describe('Hide groups smaller than this'),
  }),
  run: ({ groupBy, minGames, ...filter }) => {
    const matched = filterGames(games.value, filter)
    return {
      coverage: { analyzed: matched.filter((g) => g.analysis).length, total: matched.length },
      columns: [
        { key: 'name', label: groupBy === 'eco' ? 'ECO' : 'Opening' },
        num('games', 'Games'),
        num('score', 'Score, %'),
        num('wins', 'Wins'),
        num('draws', 'Draws'),
        num('losses', 'Losses'),
        { key: 'firstMistakeMove', label: 'First mistake', align: 'right' as const },
        num('avgCpLoss', 'Loss, cp'),
      ],
      rows: openingStats(matched, { groupBy, minGames }).slice(0, 50),
    }
  },
})

export const mistakeStatsTool = tool({
  name: 'mistake_stats',
  description:
    'Where exactly the user goes wrong: by game phase, by opening, or by mistake kind. ' +
    'Computed over analyzed games only — check coverage before drawing conclusions.',
  schema: z.object({
    ...gameFilter,
    groupBy: z.enum(['phase', 'family', 'kind']).default('phase'),
  }),
  run: ({ groupBy, ...filter }) => {
    const { rows, coverage } = mistakeStats(filterGames(games.value, filter), { groupBy })
    return {
      coverage,
      columns: [
        { key: 'name', label: groupBy === 'family' ? 'Opening' : groupBy === 'kind' ? 'Kind' : 'Phase' },
        num('games', 'Games'),
        num('blunder', 'Blunders'),
        num('mistake', 'Mistakes'),
        num('inaccuracy', 'Inaccuracies'),
        num('perGame', 'Per game'),
      ],
      rows: rows.slice(0, 50),
    }
  },
})

const METRIC_LABEL = {
  score: 'Score, %',
  rating: 'Rating',
  games: 'Games',
  blunders_per_game: 'Blunders per game',
}

export const trendTool = tool({
  name: 'trend',
  description:
    'How a metric changed over time: score, rating, game count, or blunders per game, ' +
    'by week or month. Each point carries n — how many games stand behind it.',
  schema: z.object({
    ...gameFilter,
    metric: z.enum(['score', 'rating', 'games', 'blunders_per_game']).default('score'),
    bucket: z.enum(['week', 'month']).default('month'),
  }),
  run: ({ metric, bucket, ...filter }) => ({
    yLabel: METRIC_LABEL[metric],
    series: [{ name: METRIC_LABEL[metric], points: trend(filterGames(games.value, filter), { metric, bucket }) }],
  }),
})

export const movesFromSequenceTool = tool({
  name: 'moves_from_sequence',
  description:
    'What the user played after a given move sequence, and with what score. ' +
    'Moves in SAN from the start, e.g. ["e4","c5","Nf3","d6"]; checks may be omitted. ' +
    'Use to find the typical choice in a position and get a FEN for the diagram.',
  schema: z.object({
    moves: z.array(z.string()).max(60).describe('Moves in SAN from the start'),
    color: z.enum(['white', 'black']).optional().describe('Only games with this color'),
  }),
  run: ({ moves, color }) => {
    const r = movesFromSequence(games.value, { moves, color })
    return {
      games: r.games,
      fen: r.fen,
      move: r.move,
      turn: r.turn,
      columns: [
        { key: 'move', label: 'Move' },
        num('games', 'Games'),
        num('score', 'Score, %'),
        num('wins', 'Wins'),
        num('draws', 'Draws'),
        num('losses', 'Losses'),
      ],
      rows: r.nextMoves.slice(0, 50),
      sampleGameIds: r.sampleGameIds,
    }
  },
})
