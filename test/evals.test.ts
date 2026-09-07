import { expect, test } from 'bun:test'
import { buildAnalysis, judgeMoves, phaseAt, winPct, type Ply } from '../src/stats/evals.ts'
import type { Eval } from '../src/db/schema.ts'

test('шанс на победу белых', () => {
  expect(winPct({ cp: 0 })).toBe(50)
  expect(winPct({ mate: 1 })).toBe(100)
  expect(winPct({ mate: -3 })).toBe(0)
  expect(winPct({ cp: 300 })).toBeGreaterThan(70)
  expect(winPct({ cp: -300 })).toBeCloseTo(100 - winPct({ cp: 300 }), 10)
})

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const ENDGAME = '8/5k2/8/8/8/8/5K2/6R1 w - - 0 40'
const MIDDLE = 'r1bq1rk1/pp2ppbp/2n2np1/3p4/3N4/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 11'

test('фаза партии', () => {
  expect(phaseAt(START, 0)).toBe('opening')
  expect(phaseAt(MIDDLE, 20)).toBe('opening') // до 20-го полухода всегда дебют
  expect(phaseAt(MIDDLE, 21)).toBe('middlegame')
  expect(phaseAt(ENDGAME, 40)).toBe('endgame')
})

const plies = (n: number): Ply[] =>
  Array.from({ length: n }, (_, i) => ({ san: `m${i}`, fen: i % 2 === 0 ? START : MIDDLE }))

test('судим только ходы пользователя и только заметные падения', () => {
  //             ply0    ply1        ply2        ply3
  const evals: (Eval | null)[] = [{ cp: 20 }, { cp: 20 }, { cp: -400 }, { cp: -400 }]
  // белые уронили +0.2 → −4.0 на 2-м полуходе
  expect(judgeMoves(evals, plies(4), 'white').map((m) => [m.ply, m.kind])).toEqual([[2, 'blunder']])
  // для чёрных те же оценки — улучшение, ошибок нет
  expect(judgeMoves(evals, plies(4), 'black')).toEqual([])
})

test('пропуски в оценках не ломают судейство', () => {
  const evals: (Eval | null)[] = [null, null, { cp: -400 }, null]
  expect(judgeMoves(evals, plies(4), 'white')).toEqual([])
})

test('сводка анализа', () => {
  const evals: (Eval | null)[] = [{ cp: 20 }, { cp: 20 }, { cp: -400 }, { cp: -400 }]
  const a = buildAnalysis({ evals, plies: plies(4), userColor: 'white', source: 'stockfish', depth: 12 })
  expect(a.depth).toBe(12)
  expect(a.firstMistakePly).toBe(2)
  expect(a.countsByPhase.opening.blunder).toBe(1)
  expect(a.avgCpLoss).toBe(210) // потери 0 и 420 на двух ходах белых
})

test('мат обрезается до ±1000 сп, чтобы не разносить среднюю потерю', () => {
  const evals: (Eval | null)[] = [{ cp: 0 }, { cp: 0 }, { mate: -1 }]
  const a = buildAnalysis({ evals, plies: plies(3), userColor: 'white', source: 'lichess', depth: 0 })
  expect(a.avgCpLoss).toBe(510) // (20 от старта + 1000) / 2
  expect(a.mistakes[0]!.kind).toBe('blunder')
})

test('номер хода с цветом вместо индекса полухода', async () => {
  const { moveLabel } = await import('../src/lib/format.ts')
  expect(moveLabel(0)).toBe('1.')
  expect(moveLabel(1)).toBe('1…')
  expect(moveLabel(21)).toBe('11…')
  expect(moveLabel(21, 'a6')).toBe('11…a6')
  expect(moveLabel(22, 'Bd4')).toBe('12.Bd4')
})
