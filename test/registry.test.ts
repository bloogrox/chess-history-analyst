import { expect, test } from 'bun:test'
import { games } from '../src/db/games.ts'
import { runTool, tools, toolSpecs } from '../src/agent/registry.ts'
import { library } from './library.ts'

games.value = library

test('все инструменты из §7.1 на месте', () => {
  expect(tools.map((t) => t.name).sort()).toEqual([
    'analyze_games',
    'game_details',
    'library_summary',
    'mistake_stats',
    'moves_from_sequence',
    'opening_stats',
    'query_games',
    'trend',
  ])
})

test('схемы превращаются в JSON Schema для OpenRouter', () => {
  for (const spec of toolSpecs()) {
    expect(spec.type).toBe('function')
    expect(spec.function.description.length).toBeGreaterThan(40)
    const params = spec.function.parameters as Record<string, unknown>
    expect(params.type).toBe('object')
    expect(JSON.stringify(params)).not.toInclude('$ref') // OpenRouter не любит ссылки
  }
})

test('невалидные аргументы возвращаются моделью читаемой ошибкой, а не исключением', async () => {
  expect(await runTool('opening_stats', { groupBy: 'что-то' })).toMatchObject({
    error: 'Аргументы не подошли',
  })
  expect(await runTool('analyze_games', { gameIds: [] })).toMatchObject({ error: 'Аргументы не подошли' })
  expect(await runTool('moves_from_sequence', null)).toMatchObject({ error: 'Аргументы не подошли' })
  expect(await runTool('нет_такого', {})).toMatchObject({ error: 'Инструмента нет_такого нет' })
})

test('исключение внутри инструмента становится ошибкой в результате', async () => {
  expect(await runTool('moves_from_sequence', { moves: ['e4', 'e5', 'Nf6'] })).toEqual({
    error: 'Ход 2.Nf6 невозможен в этой позиции',
  })
})

test('opening_stats отдаёт колонки и строки со ходом первой ошибки', async () => {
  const result = (await runTool('opening_stats', { groupBy: 'family' })) as {
    coverage: { analyzed: number; total: number }
    columns: { key: string }[]
    rows: { name: string; games: number; firstMistakeMove: string | null }[]
  }
  expect(result.coverage).toEqual({ analyzed: 8, total: 40 })
  expect(result.columns.map((c) => c.key)).toContain('firstMistakeMove')
  expect(result.rows[0]).toMatchObject({ name: 'Sicilian Defense', games: 12, firstMistakeMove: '11…' })
})

test('query_games: ход первой ошибки, а не номер полухода', async () => {
  const result = (await runTool('query_games', { analyzedOnly: true, limit: 3, sort: 'date_asc' })) as {
    total: number
    items: { id: string; firstMistakeMove: string | null; opponent: string }[]
  }
  expect(result.total).toBe(8)
  expect(result.items).toHaveLength(3)
  expect(result.items[0]!.firstMistakeMove).toBe('11…')
  expect(result.items[0]!.opponent).toBe('rival')
})

test('query_games: свежие неразобранные + offset + depth/source', async () => {
  const fresh = (await runTool('query_games', {
    unanalyzedOnly: true,
    limit: 5,
    sort: 'date_desc',
  })) as { total: number; items: { id: string; depth: null; source: null }[] }
  expect(fresh.total).toBe(32)
  expect(fresh.items).toHaveLength(5)
  expect(fresh.items[0]).toMatchObject({ depth: null, source: null })
  const page2 = (await runTool('query_games', {
    unanalyzedOnly: true,
    limit: 5,
    offset: 5,
    sort: 'date_desc',
  })) as { items: { id: string }[] }
  expect(page2.items.map((i) => i.id)).not.toEqual(fresh.items.map((i) => i.id))
  const done = (await runTool('query_games', { analyzedOnly: true, limit: 1 })) as {
    items: { depth: number; source: string }[]
  }
  expect(done.items[0]).toMatchObject({ depth: 0, source: 'lichess' })
  const details = (await runTool('game_details', { gameId: 'sic-0' })) as {
    depth: number
    source: string
  }
  expect(details).toMatchObject({ depth: 0, source: 'lichess' })
})

test('значения по умолчанию проставляются схемой', async () => {
  const result = (await runTool('query_games', {})) as { items: unknown[] }
  expect(result.items).toHaveLength(10) // limit по умолчанию
  const stats = (await runTool('opening_stats', {})) as { rows: unknown[] }
  expect(stats.rows).toHaveLength(4) // minGames по умолчанию 5 — Caro-Kann отсечён
})

test('game_details по несуществующей партии — подсказка, а не падение', async () => {
  expect(await runTool('game_details', { gameId: 'нет' })).toMatchObject({
    error: 'Партия нет не найдена',
  })
})

test('game_details отдаёт ошибки ходами и нумерованный текст ходов', async () => {
  const result = (await runTool('game_details', { gameId: 'sic-0', includeMoves: true })) as {
    mistakes: { move: string }[]
    moves: string
    firstMistakeMove: string | null
    controlLabel: string
  }
  expect(result.moves).toBe('1. e4 e5')
  // в фикстуре сохранён только номер полухода — SAN нет, но ход всё равно называется ходом
  expect(result.firstMistakeMove).toBe('11…')
  expect(result.mistakes).toEqual([])
  // сырой TimeControl идёт в секундах — отдаём человекочитаемый label, чтобы модель не читала «300+0» как минуты
  expect(result.controlLabel).toBe('blitz 5+0')
})

test('trend отдаёт серию для графика', async () => {
  const result = (await runTool('trend', { metric: 'games', bucket: 'month' })) as {
    series: { name: string; points: { x: string; y: number; n: number }[] }[]
  }
  expect(result.series[0]!.points[0]).toEqual({ x: '2026-01', y: 12, n: 12 })
})

test('library_summary даёт ник и топ дебютов', async () => {
  const result = (await runTool('library_summary', {})) as {
    userName: string
    total: number
    topFamilies: { name: string; games: number; score: number }[]
  }
  expect(result).toMatchObject({ userName: 'petrov77', total: 40 })
  expect(result.topFamilies[0]).toEqual({ name: 'Sicilian Defense', games: 12, score: 41.7 })
})

test('пустые значения полей фильтра считаются отсутствием поля', async () => {
  // так их шлёт GPT: все необязательные поля заполнены «пустышками»
  const result = (await runTool('opening_stats', {
    color: 'black',
    openingFamily: '',
    openingVariation: '',
    eco: '',
    dateFrom: null,
    dateTo: null,
    speed: [],
    groupBy: 'family',
    minGames: 1,
  })) as { rows: { name: string }[]; error?: string }

  expect(result.error).toBeUndefined()
  expect(result.rows.length).toBeGreaterThan(0)
})

test('пустой массив ходов не считается пропущенным полем', async () => {
  const result = (await runTool('moves_from_sequence', { moves: [] })) as { games: number; error?: string }
  expect(result.error).toBeUndefined()
  expect(result.games).toBeGreaterThan(0)
})
