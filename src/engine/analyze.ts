import { Chess } from 'chess.js'
import { signal } from '@preact/signals'
import { putEvals } from '../db/evals.ts'
import { games, updateAnalysis } from '../db/games.ts'
import { getSetting } from '../db/settings.ts'
import type { Analysis, Eval, Game } from '../db/schema.ts'

import { buildAnalysis, firstMistakeMove, type Ply } from '../stats/evals.ts'
import { Engine } from './engine.ts'
import { uciToSan } from './uci.ts'

const DEFAULT_DEPTH = 12

/** Глубина из настроек — она же по умолчанию и для агента, и для кнопки в настройках. */
export function analysisDepth(): number {
  const value = Number(getSetting('depth'))
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DEPTH
}

export interface AnalysisProgress {
  /** Позиций разобрано и всего в текущей партии. */
  done: number
  total: number
  /** Партий разобрано и всего в текущем запуске. */
  gamesDone: number
  gamesTotal: number
}

export const analysisProgress = signal<AnalysisProgress | null>(null)

let shared: Engine | null = null
let running: AbortController | null = null

export function engine() {
  return (shared ??= new Engine())
}

/** Ходы партии с FEN до каждого и позиция после последнего хода. */
function replay(game: Game): { plies: Ply[]; finalFen: string } {
  const chess = new Chess()
  chess.loadPgn(game.pgn)
  const history = chess.history({ verbose: true })
  return {
    plies: history.map((m) => ({ san: m.san, fen: m.before })),
    finalFen: history.at(-1)?.after ?? chess.fen(),
  }
}

const upToDate = (game: Game, depth: number) =>
  game.analysis?.source === 'stockfish' && game.analysis.depth >= depth

/**
 * Разбор партии движком: оценка каждой позиции, лучшие ходы, сводка в `games`.
 * Уже разобранную на такой же или большей глубине партию пропускает.
 */
export async function analyzeGame(
  game: Game,
  {
    depth = analysisDepth(),
    onProgress,
    signal: abort,
  }: { depth?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Analysis | null> {
  if (upToDate(game, depth)) return game.analysis

  const { plies, finalFen } = replay(game)
  if (!plies.length) return null

  // позиции: перед каждым ходом + итоговая. Оценка позиции i+1 — это оценка после хода i.
  const positions = [...plies.map((p) => p.fen), finalFen]
  const evals: (Eval | null)[] = Array(plies.length).fill(null)
  const e = engine()

  for (const [i, fen] of positions.entries()) {
    if (abort?.aborted) throw new DOMException('Разбор отменён', 'AbortError')
    const result = await e.evaluate(fen, { depth })
    if (i > 0) evals[i - 1] = result.eval
    // храним сразу SAN: наружу лучший ход уходит только в человеческой нотации
    if (i < plies.length) plies[i]!.bestMove = uciToSan(fen, result.bestMove)
    onProgress?.(i + 1, positions.length)
  }

  const analysis = buildAnalysis({
    evals,
    plies,
    userColor: game.userColor,
    source: 'stockfish',
    depth,
  })
  await putEvals([{ gameId: game.id, depth, source: 'stockfish', plies: evals }])
  await updateAnalysis(game.id, analysis)
  return analysis
}

export interface AnalyzeSummary {
  analyzed: number
  skipped: number
  mistakesFound: number
  /** Разбор оборвали — сводка неполная, но всё разобранное уже сохранено. */
  cancelled: boolean
  byGame: { id: string; firstMistakeMove: string | null; blunders: number }[]
}

/**
 * Разбор нескольких партий подряд с общим прогрессом и одной отменой на всех.
 * Отмена — не ошибка: возвращается частичная сводка с `cancelled: true`,
 * всё, что успели разобрать, уже лежит в базе.
 */
export async function analyzeGames(
  ids: string[],
  { depth = analysisDepth() }: { depth?: number } = {},
): Promise<AnalyzeSummary> {
  running?.abort()
  const controller = new AbortController()
  running = controller

  const summary: AnalyzeSummary = { analyzed: 0, skipped: 0, mistakesFound: 0, cancelled: false, byGame: [] }
  try {
    for (const [index, id] of ids.entries()) {
      const game = games.value.find((g) => g.id === id)
      if (!game) {
        summary.skipped++
        continue
      }
      if (upToDate(game, depth)) {
        summary.skipped++
        continue
      }
      analysisProgress.value = { done: 0, total: game.plyCount + 1, gamesDone: index, gamesTotal: ids.length }
      const analysis = await analyzeGame(game, {
        depth,
        signal: controller.signal,
        onProgress: (done, total) =>
          (analysisProgress.value = { done, total, gamesDone: index, gamesTotal: ids.length }),
      })
      if (!analysis) {
        summary.skipped++
        continue
      }
      summary.analyzed++
      summary.mistakesFound += analysis.mistakes.length
      summary.byGame.push({
        id,
        firstMistakeMove: firstMistakeMove(analysis),
        blunders: analysis.mistakes.filter((m) => m.kind === 'blunder').length,
      })
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
    summary.cancelled = true
  } finally {
    analysisProgress.value = null
    if (running === controller) running = null
  }
  return summary
}

/** Отменить текущий разбор: движок останавливается на ближайшей позиции. */
export function cancelAnalysis() {
  running?.abort()
  shared?.stop()
}


