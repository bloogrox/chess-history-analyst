import { useState } from 'preact/hooks'
import { strings } from './strings.ts'

const s = strings.welcome

/**
 * Ручной импорт PGN (drag-and-drop + выбор файла).
 * Сейчас не используется: импорт только с Lichess по нику.
 * Возврат: импортировать в ImportFlow idle рядом с формой ника.
 */
export function PgnDropZone({ onFile }: { onFile: (file: File) => void }) {
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
