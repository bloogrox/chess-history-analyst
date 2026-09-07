import { Chess } from 'chess.js'
import type { Color, Eval, Game } from '../db/schema.ts'
import { buildAnalysis, type Ply } from '../stats/evals.ts'
import { hashPgn, idFromSite, openingSplit, speedFromTimeControl, userResult } from './lichess.ts'

export interface ParsedGame {
  game: Game
  /** Оценки Lichess по полуходам; null — их в экспорте не было. */
  evals: (Eval | null)[] | null
}

const num = (v: string | undefined): number | null => {
  const n = Number(v)
  return v && Number.isFinite(n) ? n : null
}

/** «2026.03.14» + «18:22:11» → ISO. */
function isoDate(date: string | undefined, time: string | undefined): string {
  const d = date?.replace(/\./g, '-')
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(0).toISOString()
  return `${d}T${time && /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : '00:00:00'}Z`
}

/** `[%eval 1.24]` → сотые доли пешки, `[%eval #-3]` → мат. Всегда от белых. */
function parseEval(comment: string): Eval | null {
  const m = comment.match(/\[%eval\s+(#?)(-?\d+(?:\.\d+)?)\]/)
  if (!m) return null
  const value = Number(m[2])
  if (!Number.isFinite(value)) return null
  return m[1] ? { mate: value } : { cp: Math.round(value * 100) }
}

/**
 * Текст партии → игра пользователя. `null`, если партию брать не нужно:
 * нестандартный вариант, нет ходов, партия не доиграна, пользователь в ней не играл,
 * либо chess.js не смог её разобрать.
 */
export function parseGame(text: string, userName: string): ParsedGame | null {
  const variant = text.match(/^\[Variant\s+"([^"]*)"\]/m)?.[1]
  if (variant && variant.toLowerCase() !== 'standard') {
    console.log('[parse] skip: variant =', variant)
    return null
  }

  const chess = new Chess()
  try {
    chess.loadPgn(text)
  } catch (e) {
    console.log('[parse] skip: loadPgn error', e)
    return null
  }

  const moves = chess.history({ verbose: true })
  if (moves.length === 0) {
    console.log('[parse] skip: 0 moves')
    return null
  }

  const h = chess.getHeaders()
  const normalize = (s: string) => s.replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '').toLowerCase()
  const user = normalize(userName)
  const userColor: Color | null =
    (h.White && normalize(h.White) === user) ? 'white' : (h.Black && normalize(h.Black) === user) ? 'black' : null
  if (!userColor) {
    console.log('[parse] skip: nick mismatch', { White: h.White, Black: h.Black, userName, normalized: user })
    return null
  }

  const result = userResult(h.Result, userColor)
  if (!result) {
    console.log('[parse] skip: bad result', h.Result)
    return null
  }

  const byFen = new Map(chess.getComments().map((c) => [c.fen, c.comment]))
  const plies: Ply[] = moves.map((m) => ({ san: m.san, fen: m.before }))
  const evals = moves.map((m) => {
    const comment = byFen.get(m.after)
    return comment ? parseEval(comment) : null
  })
  const hasEvals = evals.some((e) => e !== null)

  const whiteElo = num(h.WhiteElo)
  const blackElo = num(h.BlackElo)
  const white = userColor === 'white'
  const opening = openingSplit(h.Opening)
  const id = idFromSite(h.Site) ?? hashPgn(text)

  return {
    game: {
      id,
      url: h.Site?.startsWith('http') ? h.Site : null,
      date: isoDate(h.UTCDate ?? h.Date, h.UTCTime ?? h.Time),
      white: h.White ?? '?',
      black: h.Black ?? '?',
      whiteElo,
      blackElo,
      userColor,
      userResult: result,
      userRating: white ? whiteElo : blackElo,
      opponentRating: white ? blackElo : whiteElo,
      ratingDiff: num(white ? h.WhiteRatingDiff : h.BlackRatingDiff),
      speed: speedFromTimeControl(h.TimeControl),
      timeControl: h.TimeControl ?? '-',
      eco: h.ECO && h.ECO !== '?' ? h.ECO : null,
      openingFamily: opening.family,
      openingVariation: opening.variation,
      termination: h.Termination ?? 'Normal',
      moves: moves.map((m) => m.san),
      plyCount: moves.length,
      pgn: text,
      evalsFromLichess: hasEvals,
      analysis: hasEvals
        ? buildAnalysis({ evals, plies, userColor, source: 'lichess', depth: 0 })
        : null,
    },
    evals: hasEvals ? evals : null,
  }
}
