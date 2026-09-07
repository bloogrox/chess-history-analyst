import type { Color, Result, Speed } from '../db/schema.ts'

/** Lichess: категория = base + 40·increment секунд. */
export function speedFromTimeControl(tc: string | undefined): Speed {
  if (!tc || tc === '-') return 'correspondence'
  const [base, inc] = tc.split('+').map(Number)
  if (base === undefined || !Number.isFinite(base)) return 'correspondence'
  const total = base + 40 * (Number.isFinite(inc) ? (inc as number) : 0)
  if (total < 30) return 'ultrabullet'
  if (total < 180) return 'bullet'
  if (total < 480) return 'blitz'
  if (total < 1500) return 'rapid'
  return 'classical'
}

export function idFromSite(site: string | undefined): string | null {
  return site?.match(/lichess\.org\/([a-zA-Z0-9]{8})/)?.[1] ?? null
}

/** «Sicilian Defense: Dragon Variation, Yugoslav Attack» → семейство + вариант. */
export function openingSplit(opening: string | undefined) {
  if (!opening || opening === '?') return { family: null, variation: null }
  const i = opening.indexOf(': ')
  return i < 0
    ? { family: opening, variation: null }
    : { family: opening.slice(0, i), variation: opening.slice(i + 2) }
}

export function userResult(result: string | undefined, color: Color): Result | null {
  if (result === '1/2-1/2') return 'draw'
  if (result === '1-0') return color === 'white' ? 'win' : 'loss'
  if (result === '0-1') return color === 'black' ? 'win' : 'loss'
  return null // «*» — партия не доиграна
}

/** FNV-1a: запасной id для партий не с Lichess. Не крипто, нужна лишь стабильность. */
export function hashPgn(pgn: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < pgn.length; i++) {
    h ^= pgn.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
