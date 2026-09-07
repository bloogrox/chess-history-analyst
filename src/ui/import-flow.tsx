import { useEffect, useRef, useState } from 'preact/hooks'
import { games } from '../db/games.ts'
import { getSetting, setSetting } from '../db/settings.ts'
import { runImport } from '../pgn/import.ts'
import { fetchLichessGames } from '../pgn/lichess-fetch.ts'
import { inferUser, type InferredUser } from '../pgn/infer-user.ts'
import { splitPgn } from '../pgn/split.ts'
import { ImportProgress } from './import-progress.tsx'
import { strings } from './strings.ts'
import { plural } from '../lib/format.ts'

const s = strings.welcome

/** 6 месяцев назад в миллисекундах. */
const SIX_MONTHS = 180 * 24 * 60 * 60 * 1000

/** Стандартный лимит для начального импорта. */
const DEFAULT_MAX = 200

interface PreviewInfo {
  text: string
  count: number
  from: string
  to: string
  bySpeed: { speed: string; count: number }[]
}

type Stage =
  | { k: 'idle' }
  | { k: 'reading' }
  | { k: 'ask'; text: string; guess: InferredUser }
  | { k: 'fetching'; games: number }
  | { k: 'preview'; info: PreviewInfo; userName: string }
  | { k: 'importing'; done: number; total: number }
  | { k: 'report'; imported: number; duplicates: number; skipped: number }
  | { k: 'error'; message: string }

function Card({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="flex flex-col gap-3 rounded-lg border border-line bg-card px-6 py-[26px]">
      {children}
    </div>
  )
}

function Pill({
  children,
  onClick,
  primary,
}: {
  children: preact.ComponentChildren
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`rounded-full px-3.5 py-[7px] text-sm ${
        primary ? 'border border-ink font-medium' : 'border border-line text-ink-2 hover:border-ink-3'
      }`}
    >
      {children}
    </button>
  )
}

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  return (
    <label
      class={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-[1.5px] border-dashed px-6 py-[30px] transition-colors ${
        over ? 'border-ink bg-ochre-tint' : 'border-ink-3 bg-card'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer?.files[0]
        if (file) onFile(file)
      }}
    >
      <input
        type="file"
        accept=".pgn,.txt,application/x-chess-pgn,text/plain"
        class="hidden"
        onChange={(e) => {
          const input = e.currentTarget
          const file = input.files?.[0]
          if (file) onFile(file)
          input.value = '' // чтобы тот же файл можно было выбрать повторно
        }}
      />
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1f1915"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <div class="text-base font-medium">{s.dropTitle}</div>
      <div class="text-sm text-ink-2">
        {s.dropOr} <span class="text-ochre underline-offset-2 hover:underline">{s.dropPick}</span>
      </div>
    </label>
  )
}

/** Докачка: от самой свежей партии в библиотеке плюс секунда. */
function sinceLatest(): number | undefined {
  const last = games.value.reduce((max, g) => Math.max(max, Date.parse(g.date)), 0)
  return last > 0 ? last + 1000 : undefined
}

/** Дата для превью: YYYY-MM-DD → «14 марта 2025» */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Извлечь инфу о скорости из PGN-заголовков. */
function extractSpeeds(text: string): { speed: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const m of text.matchAll(/\[TimeControl\s+"([^"]*)"\]/g)) {
    const tc = m[1]
    if (!tc) continue
    const speed = speedFromTimeControl(tc)
    counts.set(speed, (counts.get(speed) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([speed, count]) => ({ speed, count }))
}

function speedFromTimeControl(tc: string): string {
  if (tc === '-') return 'no clock'
  const parts = tc.split('+')
  const base = parseInt(parts[0] || '0', 10)
  if (base <= 30) return 'ultrabullet'
  if (base <= 180) return 'blitz'
  if (base <= 600) return 'rapid'
  if (base <= 1800) return 'classical'
  return 'other'
}

/** Найти дату самой старой и самой свежей партии в PGN. */
function findDateRange(text: string): { earliest: string; latest: string } {
  let earliest = '9999-99-99'
  let latest = '0000-00-00'
  for (const m of text.matchAll(/\[UTCDate\s+"(\d{4}\.\d{2}\.\d{2})"\]/g)) {
    const dateStr = m[1]
    if (!dateStr) continue
    const iso = dateStr.replace(/\./g, '-')
    if (iso < earliest) earliest = iso
    if (iso > latest) latest = iso
  }
  return { earliest, latest }
}

/** Дропзона + загрузка с Lichess + подтверждение ника + прогресс + итог. Welcome и модалка. */
export function ImportFlow({
  onImported,
  update,
}: {
  onImported?: (imported: number) => void
  /** Открыто как «Обновить с Lichess»: докачка начинается сразу. */
  update?: boolean
}) {
  const [stage, setStage] = useState<Stage>({ k: 'idle' })
  const [nick, setNick] = useState(getSetting('userName') ?? '')
  const abort = useRef<AbortController | null>(null)

  async function startImport(text: string, userName: string) {
    console.log('[import] start called with userName:', userName)
    setSetting('userName', userName)
    setStage({ k: 'importing', done: 0, total: 0 })
    try {
      const done = await runImport({ text, userName }, (d, total) =>
        setStage({ k: 'importing', done: d, total }),
      )
      setStage({ k: 'report', ...done })
      onImported?.(done.imported)
    } catch (err) {
      setStage({ k: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Показать превью перед импортом. */
  function showPreview(text: string, userName: string) {
    const chunks = splitPgn(text)
    if (chunks.length === 0) {
      setStage({ k: 'error', message: s.notPgn })
      return
    }
    const { earliest, latest } = findDateRange(text)
    const bySpeed = extractSpeeds(text)
    setStage({
      k: 'preview',
      info: {
        text,
        count: chunks.length,
        from: formatDate(earliest),
        to: formatDate(latest),
        bySpeed,
      },
      userName,
    })
  }

  /** Загрузка с Lichess: начальный импорт (с лимитом) или докачка. */
  async function fromLichess(
    name: string,
    opts?: { max?: number; since?: number; skipPreview?: boolean },
  ) {
    const trimmed = name.trim()
    if (!trimmed) return setStage({ k: 'error', message: s.noNick })
    setSetting('userName', trimmed)
    const controller = new AbortController()
    abort.current = controller
    setStage({ k: 'fetching', games: 0 })
    try {
      const text = await fetchLichessGames({
        userName: trimmed,
        max: opts?.max,
        since: opts?.since,
        signal: controller.signal,
        onProgress: (count) => setStage({ k: 'fetching', games: count }),
      })
      if (opts?.skipPreview) {
        await startImport(text, trimmed)
      } else {
        showPreview(text, trimmed)
      }
    } catch (err) {
      // отмена — не ошибка: библиотека осталась прежней, возвращаемся к выбору
      if (err instanceof DOMException && err.name === 'AbortError') return setStage({ k: 'idle' })
      setStage({ k: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Начальный импорт: последние 200 партий за полгода. */
  async function fetchInitial(name: string) {
    const since = Date.now() - SIX_MONTHS
    await fromLichess(name, { max: DEFAULT_MAX, since })
  }

  /** Докачка: от самой свежей + превью. */
  async function fetchUpdate(name: string) {
    const since = sinceLatest()
    await fromLichess(name, { since, skipPreview: true })
  }

  /** Полная выгрузка: всё с Lichess. */
  async function fetchAll(name: string) {
    await fromLichess(name, { skipPreview: true })
  }

  useEffect(() => {
    if (update) {
      const name = getSetting('userName') ?? ''
      if (name) void fetchUpdate(name)
    }
  }, [])

  async function onFile(file: File) {
    setStage({ k: 'reading' })
    const text = await file.text()
    console.log('[import] file loaded, length:', text.length)
    const guess = inferUser(text)
    console.log('[import] inferred user:', guess)
    if (!guess) return setStage({ k: 'error', message: s.notPgn })
    const known = getSetting('userName')?.trim()
    console.log('[import] known from settings:', known)
    console.log('[import] guess.top:', guess.top)
    if (known && guess.top.some((t) => t.name.toLowerCase() === known.toLowerCase())) {
      console.log('[import] auto-starting with known user:', known)
      return startImport(text, known)
    }
    console.log('[import] asking user to confirm')
    setStage({ k: 'ask', text, guess })
  }

  switch (stage.k) {
    case 'idle':
      return (
        <div class="flex flex-col gap-3">
          <DropZone onFile={onFile} />
          <div class="text-[13px] text-ink-2">{s.orLichess}</div>
          <form
            class="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void fetchInitial(nick.trim())
            }}
          >
            <input
              value={nick}
              placeholder={s.nickPlaceholder}
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => setNick(e.currentTarget.value)}
              class="h-10 min-w-0 flex-1 rounded-md border border-line bg-card px-3 text-sm"
            />
            <button
              type="submit"
              disabled={!nick.trim()}
              class="h-10 flex-none rounded-md border border-ink bg-paper px-4 text-sm font-medium disabled:opacity-40"
            >
              {s.fetch}
            </button>
          </form>
        </div>
      )

    case 'fetching':
      return (
        <Card>
          <div class="text-base font-medium">{s.fetching}</div>
          <div class="font-mono text-xs text-ink-3">{s.fetched(stage.games)}</div>
          <div class="text-[13px] text-ink-2">{s.fetchingHint}</div>
          <div>
            <Pill onClick={() => abort.current?.abort()}>{s.cancel}</Pill>
          </div>
        </Card>
      )

    case 'reading':
      return (
        <Card>
          <div class="text-base font-medium">{s.reading}</div>
        </Card>
      )

    case 'ask':
      return (
        <Card>
          <div class="font-serif text-[28px] leading-none">{s.whoAreYou(stage.guess.name)}</div>
          <div class="text-[13px] text-ink-2">{s.whoAreYouHint}</div>
          <div class="flex flex-wrap gap-2">
            <Pill primary onClick={() => startImport(stage.text, stage.guess.name)}>
              {s.yes}
            </Pill>
            {stage.guess.top
              .filter((t) => t.name !== stage.guess.name)
              .map((t) => (
                <Pill key={t.name} onClick={() => startImport(stage.text, t.name)}>
                  {t.name}
                </Pill>
              ))}
            <Pill
              onClick={() => {
                const name = prompt(s.otherName, stage.guess.name)?.trim()
                if (name) startImport(stage.text, name)
              }}
            >
              {s.otherName}
            </Pill>
          </div>
        </Card>
      )

    case 'preview':
      return (
        <Card>
          <div class="text-base font-medium">{s.previewTitle}</div>
          <div class="font-mono text-xs text-ink-3">
            {s.previewStats({ count: stage.info.count, from: stage.info.from, to: stage.info.to })}
          </div>
          {stage.info.bySpeed.length > 0 && (
            <div class="text-[13px] text-ink-2">
              {s.previewBreakdown(stage.info.bySpeed)}
            </div>
          )}
          <div class="flex flex-wrap gap-2">
            <Pill primary onClick={() => startImport(stage.info.text, stage.userName)}>
              {s.importRecent} {stage.info.count} {plural(stage.info.count, ['game', 'games', 'games'])}
            </Pill>
            <Pill
              onClick={() => {
                void fromLichess(stage.userName, {
                  max: 500,
                  since: Date.now() - SIX_MONTHS * 2,
                })
              }}
            >
              {s.importHalfYear}
            </Pill>
            <Pill
              onClick={() => {
                void fetchAll(stage.userName)
              }}
            >
              {s.importAll}
            </Pill>
          </div>
        </Card>
      )

    case 'importing':
      return <ImportProgress done={stage.done} total={stage.total} />

    case 'report':
      return (
        <Card>
          <div class="text-base font-medium">
            {stage.imported > 0 ? s.imported(stage.imported) : s.nothingImported}
          </div>
          <div class="font-mono text-xs text-ink-3">{s.stats(stage)}</div>
          {stage.skipped > 0 && <div class="text-[13px] text-ink-2">{s.skippedHint}</div>}
          <div>
            <Pill primary onClick={() => setStage({ k: 'idle' })}>
              {s.importAgain}
            </Pill>
          </div>
        </Card>
      )

    case 'error':
      return (
        <Card>
          <div class="text-base font-medium text-loss">{s.failed}</div>
          <div class="text-[13px] text-ink-2">{stage.message}</div>
          <div>
            <Pill primary onClick={() => setStage({ k: 'idle' })}>
              {s.retry}
            </Pill>
          </div>
        </Card>
      )
  }
}
