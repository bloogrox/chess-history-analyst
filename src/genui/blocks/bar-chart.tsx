import { n } from '../../lib/format.ts'

/**
 * Столбцы горизонтальные: подписи дебютов по-русски длинные, вертикальные столбцы
 * пришлось бы поворачивать. Полоса — div, как W/D/L в макете.
 */
export function BarChartBlock({
  items,
  unit,
}: {
  items: { label: string; value: number }[]
  unit?: string
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1)
  return (
    <div class="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_64px] items-center gap-3 text-[13px]">
          <div class="truncate" title={item.label}>
            {item.label}
          </div>
          <div class="h-3 bg-paper-2">
            <div class="h-3 rounded-r-[2px] bg-ochre" style={{ width: `${(Math.abs(item.value) / max) * 100}%` }} />
          </div>
          <div class="text-right font-mono text-xs">
            {n(item.value)}
            {unit ? ` ${unit}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
