import { n } from '../lib/format.ts'
import { strings } from './strings.ts'

const s = strings.welcome

export function ImportProgress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div class="flex flex-col gap-2.5 rounded-lg border border-line bg-card px-6 py-[30px]">
      <div class="flex items-baseline justify-between gap-4">
        <div class="text-base font-medium">{s.importing}</div>
        <div class="font-mono text-xs text-ink-3">
          {n(done)} / {n(total)}
        </div>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-line">
        <div class="h-full bg-ink transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div class="text-[13px] text-ink-2">{s.importingHint}</div>
    </div>
  )
}
