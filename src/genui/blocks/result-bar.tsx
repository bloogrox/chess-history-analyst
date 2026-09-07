import { n } from '../../lib/format.ts'

/** Полоса побед/ничьих/поражений из макета: зазор 2px, скругление по краям, легенда с числами. */
export function ResultBarBlock({
  wins,
  draws,
  losses,
  label,
}: {
  wins: number
  draws: number
  losses: number
  label?: string
}) {
  const total = wins + draws + losses
  if (total <= 0) return null

  const parts = [
    { value: wins, color: 'bg-win', word: 'wins' },
    { value: draws, color: 'bg-line', word: 'draws' },
    { value: losses, color: 'bg-loss', word: 'losses' },
  ].filter((p) => p.value > 0)

  return (
    <div class="flex flex-col gap-2">
      {label && <div class="text-[13px] text-ink-2">{label}</div>}
      <div class="flex h-3 gap-[2px]">
        {parts.map((p, i) => (
          <div
            key={p.word}
            class={`${p.color} ${i === 0 ? 'rounded-l' : ''} ${i === parts.length - 1 ? 'rounded-r' : ''}`}
            style={{ width: `${(p.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div class="flex flex-wrap gap-4 text-xs text-ink-2">
        {parts.map((p) => (
          <div key={p.word} class="flex items-center gap-1.5">
            <span class={`h-2.5 w-2.5 rounded-[2px] ${p.color}`} />
            <span>
              {Math.round((p.value / total) * 100)} % {p.word} · {n(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
