import { z } from 'zod'
import { games } from '../../db/games.ts'
import { librarySummary } from '../../stats/summary.ts'
import { tool } from './schema.ts'

export const librarySummaryTool = tool({
  name: 'library_summary',
  description:
    'What the library holds: how many games, which period, by time control and color, ' +
    'how many are engine-analyzed, top-5 openings. Call for overall context or exact opening names.',
  schema: z.object({}),
  run: () => {
    const list = games.value
    const s = librarySummary(list)
    const first = list[0]
    return {
      total: s.total,
      userName: first ? (first.userColor === 'white' ? first.white : first.black) : null,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
      bySpeed: s.bySpeed,
      ratingBySpeed: s.ratingNow,
      byColor: s.byColor,
      withEvals: s.withEvals,
      analyzed: s.analyzed,
      topFamilies: s.topFamilies,
      // те же топ-дебюты, но в форме таблицы: блок table со source рисует их без преобразований
      columns: [
        { key: 'name', label: 'Opening' },
        { key: 'games', label: 'Games', align: 'right' as const },
        { key: 'score', label: 'Score, %', align: 'right' as const },
      ],
      rows: s.topFamilies,
    }
  },
})
