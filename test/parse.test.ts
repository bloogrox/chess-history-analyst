import { expect, test } from 'bun:test'
import { parseGame } from '../src/pgn/parse.ts'
import { splitPgn } from '../src/pgn/split.ts'

const withEvals = await Bun.file('test/fixtures/with-evals.pgn').text()
const [italian, vanKruijs, chess960, unfinished] = splitPgn(
  await Bun.file('test/fixtures/plain.pgn').text(),
)

test('партия с оценками Lichess', () => {
  const p = parseGame(withEvals, 'petrov77')!
  expect(p).not.toBeNull()
  expect(p.game.id).toBe('aBcD1234')
  expect(p.game.url).toBe('https://lichess.org/aBcD1234')
  expect(p.game.date).toBe('2026-03-14T18:22:11Z')
  expect(p.game.userColor).toBe('black')
  expect(p.game.userResult).toBe('win')
  expect(p.game.userRating).toBe(1907)
  expect(p.game.opponentRating).toBe(1842)
  expect(p.game.ratingDiff).toBe(7)
  expect(p.game.speed).toBe('blitz')
  expect(p.game.eco).toBe('B76')
  expect(p.game.openingFamily).toBe('Sicilian Defense')
  expect(p.game.openingVariation).toBe('Dragon Variation, Yugoslav Attack')
  expect(p.game.plyCount).toBe(26)
  expect(p.game.moves[0]).toBe('e4')
  expect(p.game.evalsFromLichess).toBe(true)
})

test('оценки разбираются по полуходам, включая мат', () => {
  const { evals } = parseGame(withEvals, 'petrov77')!
  expect(evals).toHaveLength(26)
  expect(evals![0]).toEqual({ cp: 17 })
  expect(evals![19]).toEqual({ cp: 351 })
  expect(evals![23]).toEqual({ mate: -3 })
  expect(evals![25]).toBeNull() // у последнего хода комментария нет
})

test('анализ по оценкам Lichess считается сразу', () => {
  const { game } = parseGame(withEvals, 'petrov77')!
  const a = game.analysis!
  expect(a.source).toBe('lichess')
  expect(a.depth).toBe(0)
  // 10…Nxd5 роняет оценку с +0.25 до +3.51 — ошибка чёрных на 19-м полуходе
  expect(a.mistakes.map((m) => m.ply)).toEqual([19])
  expect(a.mistakes[0]!.san).toBe('Nxd5')
  expect(a.mistakes[0]!.kind).toBe('mistake')
  expect(a.mistakes[0]!.fen).toInclude(' b ') // FEN до хода — очередь чёрных
  expect(a.firstMistakePly).toBe(19)
  expect(a.countsByPhase.opening.mistake).toBe(1) // 19-й полуход — ещё дебют
  expect(a.avgCpLoss).toBeGreaterThan(0)
})

test('партия только с %clk — без оценок и анализа', () => {
  const p = parseGame(vanKruijs!, 'petrov77')!
  expect(p.game.evalsFromLichess).toBe(false)
  expect(p.evals).toBeNull()
  expect(p.game.analysis).toBeNull()
  expect(p.game.userResult).toBe('draw')
  expect(p.game.speed).toBe('bullet')
})

test('обычная партия без комментариев', () => {
  const p = parseGame(italian!, 'petrov77')!
  expect(p.game.userColor).toBe('white')
  expect(p.game.userResult).toBe('win')
  expect(p.game.ratingDiff).toBe(8)
  expect(p.game.speed).toBe('rapid')
})

test('пропускаем то, что не наша стандартная доигранная партия', () => {
  expect(parseGame(chess960!, 'petrov77')).toBeNull() // Chess960
  expect(parseGame(unfinished!, 'petrov77')).toBeNull() // результат «*»
  expect(parseGame(italian!, 'кто-то-другой')).toBeNull() // пользователь не играл
  expect(parseGame('[Event "x"]\n\nне пгн вовсе', 'petrov77')).toBeNull()
  expect(parseGame('[Event "x"]\n[White "petrov77"]\n[Result "1-0"]\n\n1-0', 'petrov77')).toBeNull()
})

test('ник сравнивается без учёта регистра', () => {
  expect(parseGame(italian!, 'PeTrOv77')?.game.userColor).toBe('white')
})
