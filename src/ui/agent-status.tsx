import { useEffect, useState } from 'preact/hooks'
import { agentStatus, streaming } from '../agent/loop.ts'
import { analysisProgress } from '../engine/analyze.ts'
import { strings } from './strings.ts'

const s = strings.chat

const TOOL_LABEL: Record<string, string> = {
  library_summary: 'library',
  query_games: 'games',
  opening_stats: 'openings',
  mistake_stats: 'mistakes',
  trend: 'trend',
  moves_from_sequence: 'position',
  game_details: 'game',
  analyze_games: 'engine',
}

/**
 * Живой индикатор ожидания вместо голого «Thinking…»:
 * фаза + шаг агента + тикающие секунды + пульс соединения.
 * Прогресс движка (`analyze_games`) виден прямо в ленте, а не только в шапке.
 */
export function AgentStatusView() {
  const [, setTick] = useState(0)
  const active = streaming.value

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null
  const st = agentStatus.value
  if (st.phase === 'idle') return null

  const elapsed = st.startedAt ? Math.max(0, Math.floor((Date.now() - st.startedAt) / 1000)) : 0
  const fresh = Date.now() - st.heartbeat < 5000
  const prog = analysisProgress.value

  let label = s.statusThinking
  if (st.phase === 'writing') label = s.statusWriting
  else if (st.phase === 'analyzing') label = s.statusAnalyzing
  else if (st.phase === 'tools') {
    label = st.tool ? `${s.statusTools} · ${TOOL_LABEL[st.tool] ?? st.tool}` : s.statusTools
  } else if (st.tool) {
    label = `${label} · ${TOOL_LABEL[st.tool] ?? st.tool}`
  }

  const step = st.round > 1 ? ` · ${s.statusStep(st.round)}` : ''
  let engine = ''
  if (st.phase === 'analyzing' && prog) {
    const games =
      prog.gamesTotal > 1 ? ` · game ${prog.gamesDone + 1}/${prog.gamesTotal}` : ''
    engine = ` · ${prog.done}/${prog.total} positions${games}`
  }

  return (
    <div class="label flex items-center gap-2 text-[11px]" aria-live="polite">
      <span
        class={`size-1.5 flex-none rounded-full bg-ochre ${fresh ? 'animate-pulse' : 'opacity-40'}`}
        aria-hidden="true"
      />
      <span>
        {label}
        {step} · {elapsed}s{engine}
      </span>
    </div>
  )
}
