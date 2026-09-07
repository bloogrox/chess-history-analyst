import type { Analysis, Color, Eval, Mistake, MistakeKind, Phase } from '../db/schema.ts'
import { moveLabel } from '../lib/format.ts'

/** Ход с FEN до него — вход для судейства. */
export interface Ply {
  san: string
  fen: string
  /** Лучший ход в этой позиции (UCI) — есть только после разбора движком. */
  bestMove?: string | null
}

/** Стартовая позиция: у белых небольшой перевес. */
const START: Eval = { cp: 20 }
const CP_CAP = 1000

/** Оценка → шанс победы белых, 0–100. Формула Lichess. */
export function winPct(e: Eval): number {
  if ('mate' in e) return e.mate > 0 ? 100 : 0
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * e.cp)) - 1)
}

function cpFor(e: Eval, color: Color): number {
  const white = 'mate' in e ? (e.mate > 0 ? CP_CAP : -CP_CAP) : Math.max(-CP_CAP, Math.min(CP_CAP, e.cp))
  return color === 'white' ? white : -white
}

function pctFor(e: Eval, color: Color): number {
  const white = winPct(e)
  return color === 'white' ? white : 100 - white
}

/** Материал обеих сторон, кроме пешек и королей. */
function heavyPieces(fen: string): number {
  const board = fen.split(' ')[0] ?? ''
  let n = 0
  for (const ch of board) if ('nbrqNBRQ'.includes(ch)) n++
  return n
}

// ponytail: грубая эвристика фазы; при необходимости — алгоритм Lichess (divider.ts)
export function phaseAt(fenBefore: string, ply: number): Phase {
  if (ply <= 20) return 'opening'
  return heavyPieces(fenBefore) <= 6 ? 'endgame' : 'middlegame'
}

function kindOf(drop: number): MistakeKind | null {
  if (drop >= 30) return 'blunder'
  if (drop >= 20) return 'mistake'
  if (drop >= 10) return 'inaccuracy'
  return null
}

/** Ходы пользователя, после которых его шанс на победу упал заметно. */
export function judgeMoves(evals: (Eval | null)[], plies: Ply[], userColor: Color): Mistake[] {
  const out: Mistake[] = []
  for (let ply = 0; ply < plies.length; ply++) {
    const mover: Color = ply % 2 === 0 ? 'white' : 'black'
    if (mover !== userColor) continue
    const before = ply === 0 ? START : evals[ply - 1]
    const after = evals[ply]
    const p = plies[ply]
    if (!before || !after || !p) continue

    const winPctBefore = pctFor(before, userColor)
    const winPctAfter = pctFor(after, userColor)
    const kind = kindOf(winPctBefore - winPctAfter)
    if (!kind) continue
    out.push({
      ply,
      san: p.san,
      fen: p.fen,
      phase: phaseAt(p.fen, ply),
      kind,
      winPctBefore: Math.round(winPctBefore * 10) / 10,
      winPctAfter: Math.round(winPctAfter * 10) / 10,
      bestMove: p.bestMove ?? null,
    })
  }
  return out
}

function emptyCounts(): Record<Phase, Record<MistakeKind, number>> {
  const zero = () => ({ inaccuracy: 0, mistake: 0, blunder: 0 })
  return { opening: zero(), middlegame: zero(), endgame: zero() }
}

export function buildAnalysis(opts: {
  evals: (Eval | null)[]
  plies: Ply[]
  userColor: Color
  source: 'lichess' | 'stockfish'
  depth: number
}): Analysis {
  const { evals, plies, userColor, source, depth } = opts
  const mistakes = judgeMoves(evals, plies, userColor)

  const countsByPhase = emptyCounts()
  for (const m of mistakes) countsByPhase[m.phase][m.kind]++

  let lossSum = 0
  let lossCount = 0
  for (let ply = 0; ply < plies.length; ply++) {
    const mover: Color = ply % 2 === 0 ? 'white' : 'black'
    if (mover !== userColor) continue
    const before = ply === 0 ? START : evals[ply - 1]
    const after = evals[ply]
    if (!before || !after) continue
    lossSum += Math.max(0, cpFor(before, userColor) - cpFor(after, userColor))
    lossCount++
  }

  return {
    depth,
    source,
    mistakes,
    firstMistakePly: mistakes.find((m) => m.kind !== 'inaccuracy')?.ply ?? null,
    countsByPhase,
    avgCpLoss: lossCount ? Math.round(lossSum / lossCount) : null,
  }
}

/** Первая серьёзная ошибка ходом с цветом: «11…Nxd5», либо «11…», если ход не сохранён. */
export function firstMistakeMove(analysis: Analysis | null): string | null {
  const ply = analysis?.firstMistakePly
  if (ply === undefined || ply === null) return null
  return moveLabel(ply, analysis!.mistakes.find((m) => m.ply === ply)?.san)
}
