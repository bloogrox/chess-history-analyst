import { analysisProgress, cancelAnalysis } from '../engine/analyze.ts'
import { strings } from './strings.ts'

const s = strings.analysis

/** Индикатор разбора в шапке чата: сколько позиций пройдено и кнопка отмены. */
export function AnalysisStatus() {
  const p = analysisProgress.value
  if (!p) return null
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
  return (
    <div class="flex items-center gap-2.5 rounded border border-line bg-card px-2.5 py-[5px] font-mono text-xs text-ink-2">
      <span class="label text-[11px]">{s.label}</span>
      <span class="h-1 w-16 overflow-hidden rounded-full bg-line">
        <span class="block h-full bg-ink transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </span>
      <span>{s.positions(p.done, p.total)}</span>
      {p.gamesTotal > 1 && <span class="text-ink-3">{s.ofGames(p.gamesDone, p.gamesTotal)}</span>}
      <button type="button" onClick={cancelAnalysis} class="font-medium text-ochre hover:underline">
        {s.cancel}
      </button>
    </div>
  )
}
