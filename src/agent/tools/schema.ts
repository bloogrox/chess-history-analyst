import { z } from 'zod'

/** Общие поля фильтра — их принимает большинство инструментов. */
export const gameFilter = {
  color: z.enum(['white', 'black']).optional().describe("Which color the user played"),
  result: z.enum(['win', 'loss', 'draw']).optional(),
  speed: z
    .array(z.enum(['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence']))
    .optional()
    .describe('Time controls; empty — all'),
  eco: z.string().optional().describe('ECO code prefix: "B" — whole family, "B76" — specific code'),
  openingFamily: z
    .string()
    .optional()
    .describe('Exact family name from another tool, e.g. "Sicilian Defense"'),
  openingVariation: z.string().optional().describe('Substring of the variation name, e.g. "Dragon"'),
  dateFrom: z.string().optional().describe('Not earlier than: "2026-03" or "2026-03-14", inclusive'),
  dateTo: z.string().optional().describe('Not later than, inclusive'),
  opponentRatingMin: z.number().int().optional(),
  opponentRatingMax: z.number().int().optional(),
  analyzedOnly: z.boolean().optional().describe('Only engine-analyzed games'),
  unanalyzedOnly: z.boolean().optional().describe('Only games WITHOUT engine analysis (candidates for analyze_games)'),
}

const FILTER_KEYS = new Set(Object.keys(gameFilter))

/**
 * Модели любят присылать необязательные поля фильтра пустыми: `openingFamily: ""`,
 * `dateFrom: null`, `speed: []`. Это не значение, а его отсутствие — но схема на них падает,
 * и модель получает ошибку валидации вместо ответа. Чистим только поля фильтра:
 * у других инструментов пустой массив осмысленный (`moves: []` — стартовая позиция).
 */
export function dropEmptyFilters(args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args
  const entries = Object.entries(args as Record<string, unknown>)
  const empty = (v: unknown) => v === '' || v === null || (Array.isArray(v) && v.length === 0)
  return Object.fromEntries(entries.filter(([k, v]) => !(FILTER_KEYS.has(k) && empty(v))))
}

/** Инструмент с уже стёртым типом аргументов — реестр хранит их одним списком. */
export interface Tool {
  name: string
  description: string
  schema: z.ZodType
  /** Вызывается только с данными, прошедшими `schema`. */
  run: (args: never) => Promise<unknown> | unknown
}

/** Внутри `run` аргументы типизированы схемой; наружу тип стирается. */
export function tool<S extends z.ZodType>(t: {
  name: string
  description: string
  schema: S
  run: (args: z.output<S>) => Promise<unknown> | unknown
}): Tool {
  return t as Tool
}
