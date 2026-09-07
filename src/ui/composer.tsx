import { useRef, useState } from 'preact/hooks'
import { streaming } from '../agent/loop.ts'
import { strings } from './strings.ts'

const s = strings.chat
const MAX_HEIGHT = 200

export function Composer({ onSend, onStop }: { onSend: (text: string) => void; onStop: () => void }) {
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const busy = streaming.value

  function resize() {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }

  function send() {
    const value = text.trim()
    if (!value || busy) return
    onSend(value)
    setText('')
    requestAnimationFrame(resize)
  }

  return (
    <div class="flex-none px-8 pt-3.5 pb-5">
      <div class="mx-auto flex w-[800px] max-w-full items-end gap-2.5 rounded-[10px] border border-ink bg-card py-2.5 pr-2.5 pl-3.5">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="#5c534d"
          stroke-width="1.5"
          stroke-linecap="round"
          class="mb-2 flex-none"
          aria-hidden="true"
        >
          <path d="M13.5 6.5 7.6 12.4a1.5 1.5 0 0 0 2.1 2.1l6.4-6.4a3 3 0 0 0-4.2-4.2L5.5 10.3a4.5 4.5 0 0 0 6.4 6.4L17 11.6" />
        </svg>
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={s.placeholder}
          onInput={(e) => {
            setText(e.currentTarget.value)
            resize()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          class="flex-1 resize-none self-center bg-transparent py-1 text-[15px] leading-normal outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={busy ? onStop : send}
          aria-label={busy ? s.stop : s.send}
          class="flex size-9 flex-none items-center justify-center rounded-full bg-ink text-paper"
        >
          {busy ? (
            <span class="block size-3 rounded-[2px] bg-paper" />
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M8 13V3M4 7l4-4 4 4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
