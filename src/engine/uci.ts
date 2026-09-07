import { Chess } from 'chess.js'
import type { Eval } from '../db/schema.ts'

/** `info depth 12 … score cp 37 …` → глубина и оценка глазами того, кто ходит. */
export function parseInfo(line: string): { depth: number; score: Eval } | null {
  if (line.includes(' lowerbound') || line.includes(' upperbound')) return null // прикидка, не оценка
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1])
  const score = line.match(/\bscore (cp|mate) (-?\d+)/)
  if (!Number.isFinite(depth) || !score) return null
  const value = Number(score[2])
  return { depth, score: score[1] === 'cp' ? { cp: value } : { mate: value } }
}

/** UCI отдаёт оценку от лица ходящего — приводим к точке зрения белых. */
export function toWhite(score: Eval, blackToMove: boolean): Eval {
  if (!blackToMove) return score
  if ('cp' in score) return { cp: -score.cp }
  // mate 0 — «мне уже мат»: знак у нуля потерялся бы, поэтому разворачиваем явно
  return { mate: score.mate === 0 ? 1 : -score.mate }
}

/** `bestmove g1f3 ponder e7e6` → «g1f3»; `bestmove (none)` → null. */
export function parseBestMove(line: string): string | null {
  const uci = line.split(' ')[1]
  return uci && uci !== '(none)' ? uci : null
}

export const blackToMove = (fen: string) => fen.split(' ')[1] === 'b'

/** UCI («g1f3», «e7e8q») → SAN в позиции `fen`. Наружу ходы уходят только в SAN. */
export function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci || uci.length < 4) return null
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    }).san
  } catch {
    return null // позиция и ход разошлись — лучше без подсказки, чем с выдуманной
  }
}
