import type { ComponentChildren } from 'preact'
import { streaming, toolHandles } from '../agent/loop.ts'
import type { Message } from '../db/schema.ts'
import { BlockCard, BlockErrorView, BlockPending, SuggestionsBlock } from '../genui/render.tsx'
import { parseBlock, type Block } from '../genui/schema.ts'
import { n, plural } from '../lib/format.ts'
import { fallbackSuggestions } from './fallback-suggestions.ts'
import { Markdown, splitSegments } from '../lib/markdown.tsx'
import { strings } from './strings.ts'

const s = strings.chat

const TOOL_LABEL: Record<string, string> = {
  library_summary: 'Library',
  query_games: 'Games',
  opening_stats: 'Openings',
  mistake_stats: 'Mistakes',
  trend: 'Trend',
  moves_from_sequence: 'Position',
  game_details: 'Game',
  analyze_games: 'Stockfish',
}

type Call = { id: string; handle?: string; name: string; args: unknown; result?: unknown; done: boolean }

/** Из чего считали: короткая подсказка из аргументов, чтобы дубли различались («Ошибки · по фазам»). */
function argsHint(call: Call): string | null {
  const a = call.args as Record<string, unknown> | null
  if (!a || typeof a !== 'object') return null
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  switch (call.name) {
    case 'opening_stats':
    case 'mistake_stats': {
      const g = str(a.groupBy)
      return g === 'phase'
        ? 'by phase'
        : g === 'family'
          ? 'by family'
          : g === 'kind'
            ? 'by kind'
            : g === 'variation'
              ? 'by variation'
              : (g ?? null)
    }
    case 'trend':
      return [str(a.metric), str(a.bucket)].filter(Boolean).join(' · ') || null
    case 'query_games':
      return str(a.sort) ?? null
    case 'game_details':
      return str(a.gameId)?.slice(0, 8) ?? null
    case 'analyze_games':
      return Array.isArray(a.gameIds) ? `games: ${a.gameIds.length}` : null
    case 'moves_from_sequence':
      return Array.isArray(a.moves) ? (a.moves as unknown[]).map(String).join(' ') || null : null
    default:
      return null
  }
}
type Turn = { user?: string; calls: Call[]; content: string }

const gamesWord = (count: number) => `${n(count)} ${plural(count, ['game', 'games', 'games'])}`

/** Короткий итог вызова для чипа трассы: «Дебюты → 6 строк», «Библиотека → 200 партий». */
function traceSummary(call: Call): string {
  if (!call.done) return s.traceRunning
  const result = call.result
  if (!result || typeof result !== 'object') return s.traceDone
  const r = result as Record<string, unknown>
  if (typeof r.error === 'string') return s.traceError
  // у library_summary есть и total, и rows топ-дебютов — итогом идёт размер библиотеки, а не «5 строк»
  if (call.name === 'library_summary' && typeof r.total === 'number') return gamesWord(r.total)
  if (Array.isArray(r.rows)) return `${n(r.rows.length)} ${plural(r.rows.length, ['row', 'rows', 'rows'])}`
  if (Array.isArray(r.items)) return gamesWord(r.items.length)
  if (typeof r.analyzed === 'number' && typeof r.mistakesFound === 'number') return gamesWord(r.analyzed)
  if (typeof r.total === 'number') return gamesWord(r.total)
  if (typeof r.games === 'number') return gamesWord(r.games)
  return s.traceDone
}

const json = (value: unknown) => JSON.stringify(value ?? null, null, 1)

function Trace({ calls }: { calls: Call[] }) {
  if (!calls.length) return null
  return (
    <div class="flex flex-1 flex-wrap items-start gap-2">
      {calls.map((c) => (
        <details key={c.id} class="rounded border border-line font-mono text-xs text-ink-2 open:w-full">
          <summary class="flex cursor-pointer items-center gap-1.5 px-2 py-[3px]">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <ellipse cx="8" cy="4" rx="5" ry="2" />
              <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
              <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
            </svg>
            <span>
              {TOOL_LABEL[c.name] ?? c.name}
              {argsHint(c) ? ` · ${argsHint(c)}` : ''} → {traceSummary(c)}
            </span>
          </summary>
          <div class="flex max-h-80 flex-col gap-1 overflow-auto border-t border-line px-2 py-2">
            <div class="label text-[10px]">{s.traceArgs}</div>
            <pre>{json(c.args)}</pre>
            <div class="label text-[10px]">{s.traceResult}</div>
            <pre>{json(c.result)}</pre>
          </div>
        </details>
      ))}
    </div>
  )
}


/** Текст ответа: markdown вперемешку с ```ui-блоками, данные блоков — из результатов этого же хода. */
function Answer({ content, calls, live }: { content: string; calls: Call[]; live: boolean }) {
  // блок ссылается ручкой («opening_stats#1»), но старые разговоры хранят настоящий id — берём оба
  const results = new Map<string, unknown>()
  for (const c of calls) {
    if (!c.done) continue
    results.set(c.id, c.result)
    if (c.handle) results.set(c.handle, c.result)
  }

  // соседние блоки без текста между ними — одна карточка, как в макете
  const out: ComponentChildren[] = []
  let run: Block[] = []
  const flush = () => {
    if (run.length) out.push(<BlockCard key={out.length} blocks={run} />)
    run = []
  }

  let hasSuggestions = false
  for (const seg of splitSegments(content)) {
    if (seg.kind === 'text') {
      flush()
      out.push(<Markdown key={out.length} text={seg.text} />)
      continue
    }
    if (!seg.done) {
      flush()
      out.push(<BlockPending key={out.length} />)
      continue
    }
    const block = parseBlock(seg.json, results)
    if ('error' in block) {
      flush()
      out.push(<BlockErrorView key={out.length} {...block} />)
    } else if (block.type === 'suggestions') {
      // чипы живут под ответом, а не в карточке
      flush()
      out.push(<SuggestionsBlock key={out.length} items={block.items} />)
      hasSuggestions = true
    } else {
      run.push(block)
    }
  }
  flush()
  // модель регулярно забывает suggestions-блок: в settled-ответе с готовыми вызовами
  // дорисовываем умные запасные — с id неразобранных из query_games этого же треда
  if (!hasSuggestions && !live && calls.some((c) => c.done)) {
    out.push(<SuggestionsBlock key={out.length} items={fallbackSuggestions(calls)} />)
  }

  return <>{out}</>
}

/**
 * Сообщения разговора. Один ход агента рисуется одним блоком, даже если внутри
 * было несколько кругов «вызов инструмента → ответ»: сверху трасса, снизу ответ.
 */
export function MessageList({ messages }: { messages: Message[] }) {
  const turns: Turn[] = []
  const handles = toolHandles(messages)

  for (const m of messages) {
    if (m.role === 'user') {
      turns.push({ user: m.content, calls: [], content: '' })
      continue
    }
    const turn = turns.at(-1) ?? (turns.push({ calls: [], content: '' }), turns.at(-1)!)
    if (m.role === 'assistant') {
      if (m.content) turn.content += (turn.content ? '\n\n' : '') + m.content
      for (const call of m.toolCalls ?? []) {
        turn.calls.push({
          id: call.id,
          handle: handles.get(call.id),
          name: call.name,
          args: call.args,
          done: false,
        })
      }
    } else {
      const call = turn.calls.find((c) => c.id === m.toolCallId)
      if (call) {
        call.result = m.error ? { error: m.error } : m.result
        call.done = true
      }
    }
  }

  return (
    <>
      {turns.map((turn, i) => (
        <div key={i} class="flex flex-col gap-5">
          {turn.user !== undefined && (
            <div class="flex flex-col gap-1.5 rounded-lg bg-paper-2 px-[18px] py-3.5">
              <div class="label text-[11px]">{s.you}</div>
              <div class="text-[17px] font-medium">{turn.user}</div>
            </div>
          )}
          {(turn.calls.length > 0 || turn.content) && (
            <div class="flex flex-col gap-3.5">
              <div class="flex flex-wrap items-start gap-3">
                <div class="label pt-[3px] text-[11px]">{s.agent}</div>
                <Trace calls={turn.calls} />
              </div>
              {turn.content && <Answer content={turn.content} calls={turn.calls} live={streaming.value} />}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
