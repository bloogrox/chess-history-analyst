/** Крупное число из макета: «Счёт 45,5 %» плюс сравнение мелким. */
export function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div class="flex flex-wrap items-baseline gap-3">
      <div class="font-serif text-[28px] leading-none">
        {label} {value}
      </div>
      {sub && <div class="text-[13px] text-ink-2">{sub}</div>}
    </div>
  )
}
