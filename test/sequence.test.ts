import { expect, test } from 'bun:test'
import { movesFromSequence } from '../src/stats/sequence.ts'
import { makeGame } from './factory.ts'

const g = (id: string, moves: string[], userResult: 'win' | 'draw' | 'loss', userColor: 'white' | 'black' = 'black') =>
  makeGame({ id, moves, plyCount: moves.length, userResult, userColor })

const games = [
  g('a', ['e4', 'c5', 'Nf3', 'd6'], 'win'),
  g('b', ['e4', 'c5', 'Nf3', 'd6'], 'loss'),
  g('c', ['e4', 'c5', 'Nf3', 'Nc6'], 'draw'),
  g('d', ['e4', 'c5', 'Nf3'], 'loss'), // партия кончилась ровно на последовательности
  g('e', ['e4', 'e5', 'Nf3'], 'win'), // другая последовательность
  g('f', ['e4', 'c5', 'Nc3'], 'win', 'white'),
]

test('FEN после последовательности', () => {
  const r = movesFromSequence(games, { moves: ['e4', 'c5'] })
  expect(r.fen).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
  expect(r.turn).toBe('white')
  expect(r.move).toBe('2.') // следующий — 2-й ход белых
})

test('следующие ходы со счётом, ход отдаётся с номером и цветом', () => {
  const r = movesFromSequence(games, { moves: ['e4', 'c5', 'Nf3'] })
  expect(r.games).toBe(4) // a, b, c, d
  expect(r.move).toBe('2…')
  expect(r.turn).toBe('black')
  expect(r.nextMoves).toEqual([
    { move: '2…d6', san: 'd6', games: 2, wins: 1, draws: 0, losses: 1, score: 50 },
    { move: '2…Nc6', san: 'Nc6', games: 1, wins: 0, draws: 1, losses: 0, score: 50 },
  ])
  expect(r.sampleGameIds).toEqual(['a', 'b', 'c', 'd'])
})

test('фильтр по цвету', () => {
  expect(movesFromSequence(games, { moves: ['e4', 'c5'], color: 'white' }).games).toBe(1)
  expect(movesFromSequence(games, { moves: ['e4', 'c5'], color: 'black' }).games).toBe(4)
})

test('пустая последовательность — стартовая позиция и все партии', () => {
  const r = movesFromSequence(games, { moves: [] })
  expect(r.games).toBe(6)
  expect(r.move).toBe('1.')
  expect(r.fen).toStartWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq')
  expect(r.nextMoves).toEqual([
    { move: '1.e4', san: 'e4', games: 6, wins: 3, draws: 1, losses: 2, score: 58.3 },
  ])
})

test('рокировка нулями приводится к O-O', () => {
  const castled = [g('x', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'O-O'], 'win')]
  const r = movesFromSequence(castled, { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', '0-0'] })
  expect(r.games).toBe(1)
  expect(r.nextMoves[0]!.move).toBe('4…O-O')
})

test('невозможный ход — понятная ошибка, а не падение chess.js', () => {
  expect(() => movesFromSequence(games, { moves: ['e4', 'e5', 'Nf6'] })).toThrow(
    'Ход 2.Nf6 невозможен в этой позиции',
  )
})

test('последовательности нет ни в одной партии', () => {
  const r = movesFromSequence(games, { moves: ['d4'] })
  expect(r).toMatchObject({ games: 0, nextMoves: [], sampleGameIds: [] })
})

test('SAN приводится к каноническому: «Bb5» находит партию с «Bb5+»', () => {
  const checked = [
    g('chk', ['e4', 'e6', 'd4', 'd5', 'Bb5+', 'c6'], 'win'),
    g('chk2', ['e4', 'e6', 'd4', 'd5', 'Bb5+', 'Nc6'], 'loss'),
  ]
  const r = movesFromSequence(checked, { moves: ['e4', 'e6', 'd4', 'd5', 'Bb5'] })
  expect(r.games).toBe(2)
  expect(r.move).toBe('3…')
  expect(r.nextMoves.map((m) => m.move).sort()).toEqual(['3…Nc6', '3…c6'])
  // ход с шахом в середине последовательности тоже находится
  expect(movesFromSequence(checked, { moves: ['e4', 'e6', 'd4', 'd5', 'Bb5', 'c6'] }).games).toBe(1)
})
