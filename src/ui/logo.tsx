import { strings } from './strings.ts'

export function Logo() {
  return (
    <div class="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="0.5" y="0.5" width="21" height="21" rx="3" fill="#f7f3eb" stroke="#1f1915" />
        <rect x="1" y="1" width="10" height="10" fill="#1f1915" />
        <rect x="11" y="11" width="10" height="10" fill="#1f1915" />
      </svg>
      <div class="font-serif text-[22px] font-bold tracking-[-0.01em]">{strings.appName}</div>
    </div>
  )
}
