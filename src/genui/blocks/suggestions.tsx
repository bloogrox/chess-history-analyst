import { sendMessage, streaming } from '../../agent/loop.ts'

/** Чипы-продолжения из макета: клик отправляет текст как новое сообщение. */
export function SuggestionsBlock({ items }: { items: string[] }) {
  return (
    <div class="flex flex-wrap gap-2">
      {items.map((text) => (
        <button
          key={text}
          type="button"
          disabled={streaming.value}
          onClick={() => void sendMessage(text)}
          class="rounded-full border border-ink px-3.5 py-[7px] text-sm hover:bg-ochre-tint disabled:opacity-40"
        >
          {text}
        </button>
      ))}
    </div>
  )
}
