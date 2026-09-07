import type { MistakeKind, Phase, Speed } from '../db/schema.ts'

const numberFmt = new Intl.NumberFormat('en-US')
const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' })

export const n = (value: number) => numberFmt.format(value)

/** "March 14, 2025" — long date for the library card. */
export const dateLong = (iso: string) => dateFmt.format(new Date(iso))

/** plural(2, ['game', 'games', 'games']) → 'games' */
export function plural(value: number, forms: [string, string, string]): string {
  return Math.abs(value) === 1 ? forms[0] : forms[1]
}

/**
 * Полуход (0-based) → номер хода с цветом: 0 → «1.», 21 → «11…».
 * Наружу — в результаты инструментов и в UI — всегда уходит это, а не индекс полухода.
 */
export function moveLabel(ply: number, san?: string): string {
  const label = `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`
  return san ? label + san : label
}

export const phaseLabel: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}

export const kindLabel: Record<MistakeKind, string> = {
  blunder: 'Blunders',
  mistake: 'Mistakes',
  inaccuracy: 'Inaccuracies',
}

export const speedLabel: Record<Speed, string> = {
  ultrabullet: 'ultrabullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'correspondence',
}
