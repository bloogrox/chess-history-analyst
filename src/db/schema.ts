import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type Color = 'white' | 'black'
export type Result = 'win' | 'loss' | 'draw'
export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence'
export type Phase = 'opening' | 'middlegame' | 'endgame'
export type MistakeKind = 'inaccuracy' | 'mistake' | 'blunder'

/** Всегда с точки зрения белых. */
export type Eval = { cp: number } | { mate: number }

export interface Mistake {
  ply: number
  san: string
  /** FEN ДО хода. */
  fen: string
  phase: Phase
  kind: MistakeKind
  winPctBefore: number
  winPctAfter: number
  /** Лучший ход в SAN. */
  bestMove: string | null
}

export interface Analysis {
  /** 0 — только %eval из Lichess, глубина неизвестна. */
  depth: number
  source: 'lichess' | 'stockfish'
  mistakes: Mistake[]
  firstMistakePly: number | null
  countsByPhase: Record<Phase, Record<MistakeKind, number>>
  avgCpLoss: number | null
}

export interface Game {
  id: string
  url: string | null
  /** ISO-8601 UTC. */
  date: string
  white: string
  black: string
  whiteElo: number | null
  blackElo: number | null
  userColor: Color
  userResult: Result
  userRating: number | null
  opponentRating: number | null
  ratingDiff: number | null
  speed: Speed
  timeControl: string
  eco: string | null
  openingFamily: string | null
  openingVariation: string | null
  termination: string
  /** SAN по полуходам. */
  moves: string[]
  plyCount: number
  pgn: string
  evalsFromLichess: boolean
  analysis: Analysis | null
}

/** Оценка после полухода с индексом ply; null — оценки нет. */
export interface GameEvals {
  gameId: string
  depth: number
  source: 'lichess' | 'stockfish'
  plies: (Eval | null)[]
}

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; result: unknown; error?: string; ms: number }

export interface Chat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Message[]
}

interface ChessAgentDB extends DBSchema {
  games: { key: string; value: Game }
  evals: { key: string; value: GameEvals }
  chats: { key: string; value: Chat }
}

let opened: Promise<IDBPDatabase<ChessAgentDB>> | null = null

export function db() {
  // ponytail: индексов нет — все партии живут в памяти, IndexedDB только хранит
  opened ??= openDB<ChessAgentDB>('chess-agent', 1, {
    upgrade(d) {
      d.createObjectStore('games', { keyPath: 'id' })
      d.createObjectStore('evals', { keyPath: 'gameId' })
      d.createObjectStore('chats', { keyPath: 'id' })
    },
  })
  return opened
}
