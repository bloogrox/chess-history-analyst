import { useState, useEffect, useRef } from 'preact/hooks'
import { chatStream, listModels, type Model } from '../agent/openrouter.ts'
import { analysisDepth, analyzeGames, type AnalyzeSummary } from '../engine/analyze.ts'
import { backgroundLimit, setBackgroundLimit } from '../engine/background.ts'
import { clearChats, chats } from '../db/chats.ts'
import { clearLibrary, games } from '../db/games.ts'
import { startNewChat } from '../agent/loop.ts'
import { getSetting, setSetting } from '../db/settings.ts'
import { Modal } from './modal.tsx'
import { strings } from './strings.ts'

const s = strings.settings

const DEPTHS = [8, 10, 12, 14, 16, 18]
const COUNTS = [5, 10, 25, 50]
const BACKGROUND = [0, 50, 200]

const analyzeCount = () => {
  const value = Number(getSetting('analyzeCount'))
  return Number.isFinite(value) && value > 0 ? value : 10
}

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <label class="flex items-center justify-between gap-4">
      <span class="text-sm">{label}</span>
      {children}
    </label>
  )
}

const selectClass =
  'rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[13px] text-ink'

function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: Model[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const q = filter.toLowerCase()
  const filtered = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : models

  const selected = models.find((m) => m.id === value)

  // закрыть по клику мимо
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} class="relative w-[280px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        class="flex h-9 w-full items-center justify-between rounded-md border border-line bg-card px-2 font-mono text-[13px] text-ink"
      >
        <span class={selected ? '' : 'text-ink-3'}>{selected?.name ?? '—'}</span>
        <span class="text-ink-3 text-[10px]">▼</span>
      </button>
      {open && (
        <div class="absolute z-50 mt-1 flex w-full flex-col rounded-md border border-line bg-card shadow-lg">
          <input
            type="text"
            placeholder={s.modelFilter}
            value={filter}
            onInput={(e) => setFilter(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            autofocus
            class="border-b border-line bg-transparent px-2 py-1.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          <div class="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 && (
              <div class="px-2 py-1.5 text-[13px] text-ink-3">No matches</div>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id)
                  setOpen(false)
                  setFilter('')
                }}
                class={`flex w-full items-center px-2 py-1.5 text-left font-mono text-[13px] hover:bg-ink/5 ${m.id === value ? 'text-ink font-medium' : 'text-ink'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type Check =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'ok' }
  | { k: 'error'; message: string }

function Connection() {
  const [key, setKey] = useState(getSetting('openrouterKey') ?? '')
  const [model, setModel] = useState(getSetting('model') ?? '')
  const [models, setModels] = useState<Model[]>([])
  const [list, setList] = useState<Check>({ k: 'idle' })
  const [check, setCheck] = useState<Check>({ k: 'idle' })

  async function load() {
    if (!key) return setList({ k: 'error', message: s.noKeyForModels })
    setList({ k: 'loading' })
    try {
      setModels(await listModels(key))
      setList({ k: 'idle' })
    } catch (err) {
      setList({ k: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function verify() {
    setCheck({ k: 'loading' })
    try {
      // пробный запрос: доходим до первого события, дальше не читаем
      for await (const event of chatStream({
        key,
        model,
        messages: [{ role: 'user', content: 'ping' }],
      })) {
        if (event.type === 'done' || event.type === 'text') break
      }
      setCheck({ k: 'ok' })
    } catch (err) {
      setCheck({ k: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div class="flex flex-col gap-4 border-b border-line pb-5">
      <Field label={s.key}>
        <input
          type="password"
          autocomplete="off"
          spellcheck={false}
          value={key}
          placeholder={s.keyPlaceholder}
          onInput={(e) => {
            const value = e.currentTarget.value.trim()
            setKey(value)
            setSetting('openrouterKey', value || null)
            setCheck({ k: 'idle' })
          }}
          class="w-[280px] rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[13px]"
        />
      </Field>
      <div class="text-[13px] text-ink-2">
        {s.keyHint} <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">{s.keyLink}</a>
      </div>

      <Field label={s.model}>
        {models.length ? (
          <ModelPicker
            models={models}
            value={model}
            onChange={(id) => {
              setModel(id)
              setSetting('model', id)
              setCheck({ k: 'idle' })
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            class="h-9 rounded-md border border-line px-3 text-sm"
          >
            {list.k === 'loading' ? s.loadingModels : s.loadModels}
          </button>
        )}
      </Field>
      <div class="text-[13px] text-ink-2">{s.modelHint}</div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void verify()}
          disabled={!key || !model || check.k === 'loading'}
          class="h-10 rounded-md border border-ink px-4 text-sm font-medium disabled:opacity-50"
        >
          {check.k === 'loading' ? s.checking : s.check}
        </button>
        {check.k === 'ok' && <span class="font-mono text-xs text-win">{s.checkOk}</span>}
        {check.k === 'error' && <span class="text-[13px] text-loss">{check.message}</span>}
        {list.k === 'error' && <span class="text-[13px] text-loss">{list.message}</span>}
      </div>
    </div>
  )
}

/** Удаление — через нативный confirm: модалка внутри модалки того не стоит. */
function Danger() {
  const [cleared, setCleared] = useState('')
  const gamesCount = games.value.length
  const chatsCount = chats.value.length

  const button = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      class="h-9 rounded-md border border-line px-3 text-sm text-loss hover:border-loss disabled:opacity-40"
    >
      {label}
    </button>
  )

  return (
    <div class="flex flex-col gap-2.5 border-t border-line pt-5">
      <div class="label text-[11px]">{s.danger}</div>
      <div class="flex flex-wrap items-center gap-3">
        {button(
          s.clearLibrary,
          () => {
            if (!confirm(s.clearLibraryConfirm(gamesCount))) return
            void clearLibrary().then(() => setCleared(s.clearLibrary))
          },
          gamesCount === 0,
        )}
        {button(
          s.clearChats,
          () => {
            if (!confirm(s.clearChatsConfirm(chatsCount))) return
            void clearChats().then(() => {
              startNewChat()
              setCleared(s.clearChats)
            })
          },
          chatsCount === 0,
        )}
        {cleared && <span class="font-mono text-xs text-ink-3">{s.cleared}: {cleared.toLowerCase()}</span>}
      </div>
    </div>
  )
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [depth, setDepth] = useState(analysisDepth())
  const [count, setCount] = useState(analyzeCount())
  const [state, setState] = useState<
    | { k: 'idle' }
    | { k: 'running' }
    | { k: 'done'; summary: AnalyzeSummary }
    | { k: 'cancelled'; summary: AnalyzeSummary }
    | { k: 'error'; message: string }
  >({ k: 'idle' })

  async function analyze() {
    // самые свежие партии — их разбор полезнее всего
    const ids = [...games.value]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, count)
      .map((g) => g.id)
    if (!ids.length) return setState({ k: 'error', message: s.nothingToAnalyze })
    setState({ k: 'running' })
    try {
      const summary = await analyzeGames(ids, { depth })
      setState(summary.cancelled ? { k: 'cancelled', summary } : { k: 'done', summary })
    } catch (err) {
      setState({ k: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <Modal title={s.title} onClose={onClose}>
      <div class="flex flex-col gap-4">
        <Connection />

        <Field label={s.depth}>
          <select
            class={selectClass}
            value={String(depth)}
            onChange={(e) => {
              const value = Number(e.currentTarget.value)
              setDepth(value)
              setSetting('depth', String(value))
            }}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <div class="text-[13px] text-ink-2">{s.depthHint}</div>

        <Field label={s.background}>
          <select
            class={selectClass}
            value={String(backgroundLimit.value)}
            onChange={(e) => setBackgroundLimit(Number(e.currentTarget.value))}
          >
            {BACKGROUND.map((value) => (
              <option key={value} value={String(value)}>
                {value ? s.backgroundLast(value) : s.backgroundOff}
              </option>
            ))}
          </select>
        </Field>
        <div class="text-[13px] text-ink-2">{s.backgroundHint}</div>

        <Field label={s.count}>
          <select
            class={selectClass}
            value={String(count)}
            onChange={(e) => {
              const value = Number(e.currentTarget.value)
              setCount(value)
              setSetting('analyzeCount', String(value))
            }}
          >
            {COUNTS.map((c) => (
              <option key={c} value={String(c)}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick={analyze}
            disabled={state.k === 'running'}
            class="h-10 rounded-md border border-ink px-4 text-sm font-medium disabled:opacity-50"
          >
            {state.k === 'running' ? s.analyzing : s.analyze}
          </button>
          {state.k === 'done' && (
            <span class="font-mono text-xs text-ink-3">{s.done(state.summary)}</span>
          )}
          {state.k === 'cancelled' && (
            <span class="font-mono text-xs text-ink-3">
              {s.cancelled} · {s.done(state.summary)}
            </span>
          )}
          {state.k === 'error' && <span class="text-[13px] text-loss">{state.message}</span>}
        </div>

        <Danger />
      </div>
    </Modal>
  )
}
