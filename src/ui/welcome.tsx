import { ImportFlow } from './import-flow.tsx'
import { Logo } from './logo.tsx'
import { strings } from './strings.ts'

const s = strings.welcome

const decorPieces: Record<string, string> = { '2,2': '♞', '4,5': '♔', '6,3': '♟︎' }

function DecorBoard() {
  return (
    <div
      class="pointer-events-none absolute top-24 -right-40 hidden grid-cols-[repeat(8,80px)] grid-rows-[repeat(8,80px)] border border-line xl:grid"
      aria-hidden="true"
    >
      {Array.from({ length: 64 }, (_, i) => {
        const r = Math.floor(i / 8)
        const c = i % 8
        const piece = decorPieces[`${r},${c}`]
        return (
          <div
            class={`flex items-center justify-center font-chess text-[60px] leading-none text-ink ${
              (r + c) % 2 ? 'bg-[#e7ded1]' : ''
            }`}
          >
            {piece}
          </div>
        )
      })}
    </div>
  )
}

export function Welcome() {
  return (
    <div class="relative min-h-screen overflow-hidden bg-paper">
      <DecorBoard />

      <div class="px-16 pt-7">
        <Logo />
      </div>

      <div class="relative px-16 pt-[89px] pb-16">
        <div class="flex w-[660px] max-w-full flex-col gap-5">
          <div class="label text-xs tracking-[0.1em] text-ochre">{s.eyebrow}</div>
          <h1 class="m-0 font-serif text-[64px] leading-[1.05] font-bold tracking-[-0.01em] text-balance">
            {s.title}
          </h1>
          <p class="m-0 max-w-[560px] text-[18px] leading-normal text-ink-2 text-pretty">{s.lede}</p>

          <div class="mt-2">
            <ImportFlow />
          </div>

          <div class="flex max-w-[560px] items-start gap-2 text-[13px] leading-normal text-ink-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="mt-0.5 flex-none"
              aria-hidden="true"
            >
              <rect x="3" y="7" width="10" height="7" rx="1.5" />
              <path d="M5 7V5a3 3 0 0 1 6 0v2" />
            </svg>
            <span>{s.privacy}</span>
          </div>

          <div class="mt-3 flex flex-col gap-2.5">
            <div class="label text-[11px]">{s.chipsLabel}</div>
            <div class="flex flex-wrap gap-2">
              {s.chips.map((chip) => (
                <div
                  key={chip}
                  class="rounded-full border border-line bg-card px-3.5 py-[7px] text-sm text-ink-2"
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
