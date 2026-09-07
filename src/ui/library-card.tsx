import { backgroundPaused, backgroundStatus } from '../engine/background.ts'
import { games } from '../db/games.ts'
import { dateLong, n, plural } from '../lib/format.ts'
import { librarySummary } from '../stats/summary.ts'
import { strings } from './strings.ts'

const s = strings.sidebar

export function LibraryCard({ onImport }: { onImport: (update?: boolean) => void }) {
  const sum = librarySummary(games.value)
  const background = backgroundStatus()
  return (
    <div class="flex flex-col gap-1 rounded-md border border-line bg-paper p-3.5">
      <div class="label text-[11px]">{s.library}</div>
      <div class="font-serif text-[26px] leading-[1.1]">
        {n(sum.total)} {plural(sum.total, ['game', 'games', 'games'])}
      </div>
      <div class="text-[13px] text-ink-2">
        Lichess{sum.dateTo ? ` · through ${dateLong(sum.dateTo)}` : ''}
      </div>
      {sum.analyzed > 0 && (
        <div class="font-mono text-[11px] text-ink-3">
          {s.withAnalysis}: {n(sum.analyzed)}
        </div>
      )}
      {background && (
        <div class="flex items-center gap-2 font-mono text-[11px] text-ink-3">
          <span>
            {s.background}: {s.backgroundOf(background.done, background.total)}
          </span>
          <button
            type="button"
            onClick={() => (backgroundPaused.value = !backgroundPaused.value)}
            class="text-ochre hover:underline"
          >
            {backgroundPaused.value ? s.backgroundResume : s.backgroundPause}
          </button>
        </div>
      )}
      <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-ochre">
        <button type="button" onClick={() => onImport()} class="hover:underline">
          {s.importMore}
        </button>
        <button type="button" onClick={() => onImport(true)} class="hover:underline">
          {s.updateFromLichess}
        </button>
      </div>
    </div>
  )
}
