import { n } from '../../lib/format.ts'

export type Column = { key: string; label: string; align?: 'left' | 'right' }
export type Row = Record<string, string | number | boolean | null | undefined>

const cell = (value: Row[string]) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'yes' : '—'
  return typeof value === 'number' ? n(value) : value
}

/** Таблица из макета: моно-шапка, цифры справа, подсвеченная строка охрой. */
export function TableBlock({
  columns,
  rows,
  highlight,
}: {
  columns: Column[]
  rows: Row[]
  highlight?: number
}) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                class={`label border-b border-line px-2 py-1.5 text-[11px] tracking-[0.06em] font-normal ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td
                  key={c.key}
                  class={[
                    'px-2 py-[7px]',
                    c.align === 'right' ? 'text-right font-mono' : '',
                    i === highlight ? 'bg-ochre-tint' : '',
                    i === highlight && j === 0 ? 'rounded-l font-medium' : '',
                    i === highlight && j === columns.length - 1 ? 'rounded-r' : '',
                  ].join(' ')}
                >
                  {cell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
