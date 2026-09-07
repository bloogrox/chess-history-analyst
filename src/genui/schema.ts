import { z } from 'zod'
import { n } from '../lib/format.ts'

const MAX_ROWS = 50
const MAX_SERIES = 4

/** Значение ячейки таблицы: то, что реально приходит из инструментов. */
const cell = z.union([z.string(), z.number(), z.boolean(), z.null()])

/** Свободный текст от модели: число она иногда шлёт числом — тогда форматируем по-русски. */
const text = z.union([z.string(), z.number()]).transform((v) => (typeof v === 'number' ? n(v) : v))

const square = z.string().regex(/^[a-h][1-8]$/)

/** Только расстановка фигур обязательна, остальные поля FEN необязательны. */
const fen = z.string().regex(/^([1-8pnbrqkPNBRQK]+\/){7}[1-8pnbrqkPNBRQK]+(\s.*)?$/)

const column = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(['left', 'right']).optional(),
})

const gameRow = z.object({
  id: z.string(),
  url: z.string().nullish(),
  date: z.string(),
  color: z.enum(['white', 'black']),
  result: z.enum(['win', 'loss', 'draw']),
  opening: z.string().nullish(),
  eco: z.string().nullish(),
  opponent: z.string(),
  opponentRating: z.number().nullish(),
  // компонент их не рисует, но со source блок обязан нести строку инструмента без потерь
  plyCount: z.number().optional(),
  analyzed: z.boolean().optional(),
  firstMistakeMove: z.string().nullish(),
})

const base = { source: z.string().optional(), title: z.string().optional() }

export const blockSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('stat'),
    label: z.string(),
    value: text,
    sub: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('result_bar'),
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
    label: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('table'),
    columns: z.array(column).min(1),
    rows: z.array(z.record(z.string(), cell)).max(MAX_ROWS),
    highlight: z.number().int().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('board'),
    fen,
    caption: z.string().optional(),
    highlights: z.array(square).optional(),
    arrows: z.array(z.tuple([square, square])).optional(),
    orientation: z.enum(['white', 'black']).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('line_chart'),
    series: z
      .array(
        z.object({
          name: z.string(),
          points: z.array(z.object({ x: z.string(), y: z.number(), n: z.number().optional() })).min(1),
        }),
      )
      .min(1)
      .max(MAX_SERIES),
    yLabel: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('bar_chart'),
    items: z.array(z.object({ label: z.string(), value: z.number() })).min(1).max(MAX_ROWS),
    unit: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('games'),
    items: z.array(gameRow).max(MAX_ROWS),
  }),
  z.object({
    ...base,
    type: z.literal('suggestions'),
    items: z.array(z.string()).min(1).max(4),
  }),
])

export type Block = z.output<typeof blockSchema>
export type BlockError = { error: string; json: string }

/**
 * JSON из ```ui-блока → блок или ошибка. Если задан `source`, данные берутся из результата
 * инструмента с этим tool_call_id, а поля блока их переопределяют; схема проверяет уже слитое.
 * Ничего не бросает: сообщение важнее блока.
 */
export function parseBlock(json: string, results?: Map<string, unknown>): Block | BlockError {
  const fail = (error: string): BlockError => ({ error, json })

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return fail('block is not valid JSON')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('block is not an object')

  const obj = raw as Record<string, unknown>
  let merged: Record<string, unknown> = obj

  if (typeof obj.source === 'string') {
    if (!results?.has(obj.source)) return fail(`no tool result for ${obj.source}`)
    const result = results.get(obj.source)
    if (!result || typeof result !== 'object') return fail('tool returned no data')
    if ('error' in result) return fail(String((result as { error: unknown }).error))
    merged = { ...(result as Record<string, unknown>), ...obj }
  }

  const parsed = blockSchema.safeParse(merged)
  if (!parsed.success) return fail(z.prettifyError(parsed.error))
  return parsed.data
}
