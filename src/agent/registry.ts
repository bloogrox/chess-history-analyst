import { z } from 'zod'
import type { ToolSpec } from './openrouter.ts'
import { analyzeGamesTool } from './tools/analyze.ts'
import { gameDetailsTool, queryGamesTool } from './tools/games.ts'
import { librarySummaryTool } from './tools/library.ts'
import {
  mistakeStatsTool,
  movesFromSequenceTool,
  openingStatsTool,
  trendTool,
} from './tools/stats.ts'
import { dropEmptyFilters, type Tool } from './tools/schema.ts'

export const tools: Tool[] = [
  librarySummaryTool,
  queryGamesTool,
  openingStatsTool,
  mistakeStatsTool,
  trendTool,
  movesFromSequenceTool,
  gameDetailsTool,
  analyzeGamesTool,
]

export const toolSpecs = (): ToolSpec[] =>
  tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(t.schema, { target: 'draft-07', io: 'input' }),
    },
  }))

/**
 * Аргументы приходят от модели — граница доверия. Всё, что не прошло схему,
 * возвращается моделью же читаемой ошибкой, а не исключением: пусть исправит и позовёт снова.
 */
export async function runTool(name: string, rawArgs: unknown): Promise<unknown> {
  const found = tools.find((t) => t.name === name)
  if (!found) {
    return { error: `Инструмента ${name} нет`, hint: `Доступны: ${tools.map((t) => t.name).join(', ')}` }
  }
  const parsed = found.schema.safeParse(dropEmptyFilters(rawArgs ?? {}))
  if (!parsed.success) {
    return { error: 'Аргументы не подошли', hint: z.prettifyError(parsed.error) }
  }
  try {
    return await found.run(parsed.data as never)
  } catch (err) {
    if (err instanceof Error) return { error: err.message }
    throw err
  }
}
