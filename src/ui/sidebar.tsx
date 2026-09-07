import { currentChat, openChat, startNewChat } from '../agent/loop.ts'
import { chats, removeChat } from '../db/chats.ts'
import { LibraryCard } from './library-card.tsx'
import { Logo } from './logo.tsx'
import { strings } from './strings.ts'

const s = strings.sidebar

export function Sidebar({
  onImport,
  onNavigate,
  class: cls = '',
}: {
  onImport: (update?: boolean) => void
  /** Ниже 1024px сайдбар — накладка: после выбора её надо закрыть. */
  onNavigate?: () => void
  class?: string
}) {
  return (
    <aside
      class={`w-[264px] flex-none flex-col gap-6 border-r border-line bg-paper-2 px-5 py-6 ${cls}`}
    >
      <Logo />

      <button
        type="button"
        onClick={() => {
          startNewChat()
          onNavigate?.()
        }}
        class="flex h-10 items-center justify-center gap-2 rounded-md border border-ink bg-paper text-sm font-medium"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M8 3v10M3 8h10" />
        </svg>
        <span>{s.newChat}</span>
      </button>

      <div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
        <div class="label px-2.5 pb-1.5 text-[11px]">{s.recent}</div>
        {chats.value.map((chat) => (
          <div
            key={chat.id}
            class={`group flex items-center gap-1 rounded-md pr-1 text-sm ${
              chat.id === currentChat.value.id ? 'border border-line bg-paper font-medium' : 'text-ink-2'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                openChat(chat)
                onNavigate?.()
              }}
              class="min-w-0 flex-1 truncate px-2.5 py-2 text-left"
            >
              {chat.title || strings.chat.newChatTitle}
            </button>
            <button
              type="button"
              aria-label={strings.chat.deleteChat}
              onClick={() => {
                void removeChat(chat.id)
                if (chat.id === currentChat.value.id) startNewChat()
              }}
              class="hidden size-6 flex-none items-center justify-center rounded text-ink-3 hover:text-ink group-hover:flex"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div class="grow" />

      <LibraryCard onImport={(update) => {
        onImport(update)
        onNavigate?.()
      }} />

      <div class="flex items-center gap-2 px-1 text-xs text-ink-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="flex-none"
          aria-hidden="true"
        >
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5 7V5a3 3 0 0 1 6 0v2" />
        </svg>
        <span>{s.localOnly}</span>
      </div>
    </aside>
  )
}
