import { expect, test } from 'bun:test'
import { blackToMove, parseBestMove, parseInfo, toWhite } from '../src/engine/uci.ts'

const INFO =
  'info depth 12 seldepth 19 multipv 1 score cp 37 nodes 24331 nps 935807 hashfull 9 time 26 pv g1f3 e7e6'

test('строка info: глубина и оценка', () => {
  expect(parseInfo(INFO)).toEqual({ depth: 12, score: { cp: 37 } })
  expect(parseInfo('info depth 20 score mate -3 pv a1a2')).toEqual({ depth: 20, score: { mate: -3 } })
  expect(parseInfo('info depth 0 score mate 0')).toEqual({ depth: 0, score: { mate: 0 } })
})

test('строки без настоящей оценки отбрасываются', () => {
  expect(parseInfo('info depth 12 score cp 37 lowerbound nodes 100')).toBeNull()
  expect(parseInfo('info depth 12 score cp 37 upperbound')).toBeNull()
  expect(parseInfo('info string NNUE evaluation using nn-9067e33176e')).toBeNull()
  expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull()
})

test('оценка приводится к точке зрения белых', () => {
  expect(toWhite({ cp: 37 }, false)).toEqual({ cp: 37 })
  expect(toWhite({ cp: 37 }, true)).toEqual({ cp: -37 }) // «+0.37 у чёрных» = −0.37 у белых
  expect(toWhite({ mate: 3 }, false)).toEqual({ mate: 3 })
  expect(toWhite({ mate: 3 }, true)).toEqual({ mate: -3 })
  // «мат уже стоит»: у нуля нет знака, разворачиваем явно
  expect(toWhite({ mate: 0 }, true)).toEqual({ mate: 1 })
  expect(toWhite({ mate: 0 }, false)).toEqual({ mate: 0 })
})

test('лучший ход', () => {
  expect(parseBestMove('bestmove g1f3 ponder e7e6')).toBe('g1f3')
  expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q')
  expect(parseBestMove('bestmove (none)')).toBeNull()
})

test('чей ход по FEN', () => {
  expect(blackToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false)
  expect(blackToMove('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(true)
})

test('UCI переводится в SAN для позиции', async () => {
  const { uciToSan } = await import('../src/engine/uci.ts')
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  expect(uciToSan(start, 'g1f3')).toBe('Nf3')
  expect(uciToSan(start, 'e2e4')).toBe('e4')
  // превращение и шах
  expect(uciToSan('8/4P3/8/8/8/8/8/k6K w - - 0 1', 'e7e8q')).toBe('e8=Q')
  expect(uciToSan(start, null)).toBeNull()
  expect(uciToSan(start, 'e7e5')).toBeNull() // ход не из этой позиции
  expect(uciToSan(start, 'zz')).toBeNull()
})
