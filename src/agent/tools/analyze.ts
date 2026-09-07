import { z } from 'zod'
import { analysisDepth, analyzeGames } from '../../engine/analyze.ts'
import { tool } from './schema.ts'

export const analyzeGamesTool = tool({
  name: 'analyze_games',
  description:
    'Analyze games with the Stockfish engine to get evals and mistakes. ' +
    'A slow on-device operation: at most 10 games per call, ' +
    'call only when the data is truly needed for the answer. The user can interrupt the analysis — ' +
    'then a partial summary with cancelled: true is returned.',
  schema: z.object({
    gameIds: z.array(z.string()).min(1).max(10).describe('game ids from query_games'),
    depth: z.number().int().min(6).max(20).optional().describe('Depth; defaults from settings'),
  }),
  run: async ({ gameIds, depth }) => {
    const summary = await analyzeGames(gameIds, { depth: depth ?? analysisDepth() })
    return {
      analyzed: summary.analyzed,
      skipped: summary.skipped,
      mistakesFound: summary.mistakesFound,
      cancelled: summary.cancelled,
      columns: [
        { key: 'id', label: 'Game' },
        { key: 'firstMistakeMove', label: 'First mistake', align: 'right' as const },
        { key: 'blunders', label: 'Blunders', align: 'right' as const },
      ],
      rows: summary.byGame,
    }
  },
})
