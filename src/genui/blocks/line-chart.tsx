import { n } from '../../lib/format.ts'

export type Series = { name: string; points: { x: string; y: number }[] }

const W = 720
const H = 200
const PAD = { left: 46, right: 12, top: 10, bottom: 22 }
const COLORS = ['#1f1915', '#915200', '#439458', '#bd6254']
const X_LABELS = 6

const tick = (value: number, range: number) =>
  n(range > 10 ? Math.round(value) : Math.round(value * 10) / 10)

/** Линейный график: одна ось Y, до четырёх серий, легенда при двух и больше. */
export function LineChartBlock({ series, yLabel }: { series: Series[]; yLabel?: string }) {
  const all = series.flatMap((s) => s.points.map((p) => p.y))
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || Math.abs(max) || 1
  const lo = min - range * 0.1
  const hi = max + range * 0.1

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number, count: number) => PAD.left + (count < 2 ? plotW / 2 : (i / (count - 1)) * plotW)
  const y = (value: number) => PAD.top + plotH - ((value - lo) / (hi - lo)) * plotH

  const labels = series[0]?.points.map((p) => p.x) ?? []
  const step = Math.max(1, Math.ceil(labels.length / X_LABELS))
  // крайние подписи прижимаем к краям, иначе они уезжают за viewBox
  const anchor = (px: number) => (px < PAD.left + 30 ? 'start' : px > W - PAD.right - 30 ? 'end' : 'middle')

  return (
    <div class="flex flex-col gap-2">
      {series.length > 1 && (
        <div class="flex flex-wrap gap-4 text-xs text-ink-2">
          {series.map((s, i) => (
            <div key={s.name} class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-[2px]" style={{ background: COLORS[i % COLORS.length] }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} class="w-full" role="img" aria-label={yLabel ?? 'chart'}>
        {[hi, (hi + lo) / 2, lo].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="#d8d0c3"
              stroke-width="1"
            />
            <text x={PAD.left - 8} y={y(value) + 4} text-anchor="end" fill="#877e77" font-size="11" font-family="IBM Plex Mono, monospace">
              {tick(value, range)}
            </text>
          </g>
        ))}

        {labels.map((label, i) =>
          i % step === 0 ? (
            <text
              key={label}
              x={x(i, labels.length)}
              y={H - 6}
              text-anchor={anchor(x(i, labels.length))}
              fill="#877e77"
              font-size="11"
              font-family="IBM Plex Mono, monospace"
            >
              {label}
            </text>
          ) : null,
        )}

        {series.map((s, si) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={COLORS[si % COLORS.length]}
            stroke-width="2"
            stroke-linejoin="round"
            points={s.points.map((p, i) => `${x(i, s.points.length)},${y(p.y)}`).join(' ')}
          />
        ))}
        {series.map((s, si) =>
          s.points.map((p, i) => (
            <circle
              key={`${s.name}-${i}`}
              cx={x(i, s.points.length)}
              cy={y(p.y)}
              r="2.5"
              fill={COLORS[si % COLORS.length]}
            />
          )),
        )}
      </svg>
      {yLabel && <div class="label text-[11px]">{yLabel}</div>}
    </div>
  )
}
