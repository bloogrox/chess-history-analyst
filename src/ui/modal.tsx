import { strings } from './strings.ts'

/** Нативный <dialog>: фокус-ловушка, Esc и подложка — бесплатно от браузера. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: preact.ComponentChildren
}) {
  return (
    <dialog
      ref={(el) => el?.showModal()}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose() // клик по подложке
      }}
      class="m-auto w-[560px] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-paper p-6 text-ink backdrop:bg-ink/25"
    >
      <div class="flex items-baseline justify-between gap-4 pb-4">
        <div class="font-serif text-xl font-bold">{title}</div>
        <button type="button" onClick={onClose} class="text-[13px] font-medium text-ochre hover:underline">
          {strings.close}
        </button>
      </div>
      {children}
    </dialog>
  )
}
