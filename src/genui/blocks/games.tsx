import { n } from '../../lib/format.ts'

export type GameRow = {
  id: string
  url?: string | null
  date: string
  color: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  opening?: string | null
  eco?: string | null
  opponent: string
  opponentRating?: number | null
  firstMistakeMove?: string | null
}

const RESULT: Record<GameRow['result'], { label: string; cls: string }> = {
  win: { label: 'win', cls: 'text-win' },
  loss: { label: 'loss', cls: 'text-loss' },
  draw: { label: 'draw', cls: 'text-ink-2' },
}

const COLOR = { white: 'White', black: 'Black' }

/** ISO-дата → «14.03.2026». */
const short = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.')

export function GamesBlock({ items }: { items: GameRow[] }) {
  return (
    <div class="flex flex-col">
      {items.map((g) => (
        <a
          key={g.id}
          href={g.url || `https://lichess.org/${g.id}`}
          target="_blank"
          rel="noreferrer noopener"
          class="grid grid-cols-[84px_88px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-2 text-[13px] text-ink no-underline last:border-0 hover:bg-ochre-tint/40"
        >
          <span class="font-mono text-xs text-ink-2">{short(g.date)}</span>
          <span class={RESULT[g.result].cls}>
            {RESULT[g.result].label}
            <span class="text-ink-3"> · {COLOR[g.color]}</span>
          </span>
          <span class="truncate" title={g.opening ?? undefined}>
            {g.opening ?? g.eco ?? '—'}
          </span>
          <span class="text-right text-xs text-ink-2">
            {g.opponent}
            {g.opponentRating ? ` ${n(g.opponentRating)}` : ''}
            {g.firstMistakeMove ? ` · mistake ${g.firstMistakeMove}` : ''}
          </span>
        </a>
      ))}
    </div>
  )
}
