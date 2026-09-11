import { useEffect, useRef, useState } from 'preact/hooks'
import {
  chatError,
  currentChat,
  messages,
  openFromHash,
  sendMessage,
  startNewChat,
  stopStreaming,
  streaming,
} from '../agent/loop.ts'
import { AgentStatusView } from './agent-status.tsx'
import { AnalysisStatus } from './analysis-status.tsx'
import { Composer } from './composer.tsx'
import { ImportModal } from './import-modal.tsx'
import { MessageList } from './message.tsx'
import { Settings } from './settings.tsx'
import { Sidebar } from './sidebar.tsx'
import { strings } from './strings.ts'
import { games } from '../db/games.ts'
import { model } from '../db/settings.ts'
import type { Message } from '../db/schema.ts'

const s = strings.chat

const textOf = (m: Message | undefined) => (m && m.role !== 'tool' ? m.content : '')

/** Автопрокрутка «прилипает» ко дну, только если пользователь и так внизу. */
function useStickyScroll(deps: unknown[]) {
  const box = useRef<HTMLElement>(null)
  const stuck = useRef(true)
  useEffect(() => {
    const el = box.current
    if (el && stuck.current) el.scrollTop = el.scrollHeight
  }, deps)
  return {
    ref: box,
    onScroll: () => {
      const el = box.current
      if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    },
  }
}

export function Chat() {
  const [importOpen, setImportOpen] = useState<false | 'file' | 'update'>(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const list = messages.value
  const scroll = useStickyScroll([list, textOf(list.at(-1))])

  useEffect(() => {
    openFromHash()
    addEventListener('hashchange', openFromHash)
    return () => removeEventListener('hashchange', openFromHash)
  }, [])

  const lastUserText = textOf([...list].reverse().find((m) => m.role === 'user'))

  return (
    <div class="relative flex h-screen bg-paper">
      {/* ниже 1024px сайдбар прячется и открывается кнопкой в шапке */}
      {menuOpen && (
        <div class="absolute inset-0 z-10 bg-ink/20 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}
      <Sidebar
        onImport={(update) => setImportOpen(update ? 'update' : 'file')}
        onNavigate={() => setMenuOpen(false)}
        class={menuOpen ? 'flex max-lg:absolute max-lg:z-20 max-lg:h-full' : 'flex max-lg:hidden'}
      />
      {importOpen && (
        <ImportModal update={importOpen === 'update'} onClose={() => setImportOpen(false)} />
      )}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}

      <main class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-14 flex-none items-center justify-between gap-4 border-b border-line px-8">
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label={s.menu}
              onClick={() => setMenuOpen((v) => !v)}
              class="hidden size-8 flex-none items-center justify-center rounded border border-line max-lg:flex"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </button>
            <div class="truncate font-serif text-xl font-bold">
              {currentChat.value.title || s.newChatTitle}
            </div>
          </div>
          <div class="flex flex-none items-center gap-2">
            <AnalysisStatus />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              class="flex items-center gap-1.5 rounded border border-line px-2.5 py-[5px] font-mono text-xs text-ink-2"
            >
              <span>{s.model} · {modelLabel()}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
          </div>
        </header>

        <section ref={scroll.ref} onScroll={scroll.onScroll} class="min-h-0 flex-1 overflow-y-auto px-8 pt-6">
          <div class="mx-auto flex w-[800px] max-w-full flex-col gap-5 pb-4">
            {list.length === 0 && (
              <Empty
                onAsk={(text) => void sendMessage(text)}
                onAnalyze={() => setSettingsOpen(true)}
                onImport={() => setImportOpen('update')}
              />
            )}
            <MessageList messages={list} />
            {streaming.value && !textOf(list.at(-1)) && <AgentStatusView />}
            {chatError.value && (
              <div class="flex items-center gap-3 rounded-md border border-loss/40 bg-card px-4 py-3 text-[13px]">
                <span class="text-loss">{chatError.value}</span>
                {lastUserText && !streaming.value && (
                  <button
                    type="button"
                    onClick={() => void retry()}
                    class="font-medium text-ochre hover:underline"
                  >
                    {s.retry}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <Composer onSend={(text) => void sendMessage(text)} onStop={stopStreaming} />
      </main>
    </div>
  )
}

/** Повтор: последний вопрос отправляется заново, неудавшийся обмен выбрасывается. */
async function retry() {
  const list = messages.value
  const lastUser = [...list].reverse().findIndex((m) => m.role === 'user')
  if (lastUser < 0) return
  const cut = list.length - 1 - lastUser
  const text = textOf(list[cut])
  if (!text) return
  messages.value = list.slice(0, cut)
  await sendMessage(text)
}

function modelLabel() {
  return model.value ? model.value.split('/').at(-1) : s.pickModel
}

function Empty({
  onAsk,
  onAnalyze,
  onImport,
}: {
  onAsk: (text: string) => void
  onAnalyze: () => void
  onImport: () => void
}) {
  // без единого разбора движком половина вопросов останется без ответа — говорим об этом сразу
  const noEvals = games.value.length > 0 && games.value.every((g) => !g.analysis)
  return (
    <div class="flex flex-col gap-3 pt-8">
      <div class="font-serif text-[28px] leading-none">{s.emptyTitle}</div>
      <div class="max-w-[560px] text-[15px] text-ink-2">{s.emptyHint}</div>
      {noEvals && (
        <div class="flex max-w-[560px] flex-col items-start gap-2 rounded-md border border-line bg-card px-4 py-3 text-[13px] text-ink-2">
          <span>{s.noEvalsHint}</span>
          <button type="button" onClick={onAnalyze} class="font-medium text-ochre hover:underline">
            {s.noEvalsAction}
          </button>
        </div>
      )}
      <div class="flex flex-wrap gap-2 pt-1">
        {s.starters.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => (chip.kind === 'import' ? onImport() : onAsk(chip.text))}
            class="rounded-full border border-line bg-card px-3.5 py-[7px] text-sm text-ink-2 hover:border-ink"
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div class="max-w-[560px] text-[13px] text-ink-3">…or ask your own below ↓</div>
    </div>
  )
}
