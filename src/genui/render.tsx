import type { ComponentChildren } from 'preact'
import { strings } from '../ui/strings.ts'
import { BarChartBlock } from './blocks/bar-chart.tsx'
import { BoardBlock } from './blocks/board.tsx'
import { GamesBlock } from './blocks/games.tsx'
import { LineChartBlock } from './blocks/line-chart.tsx'
import { ResultBarBlock } from './blocks/result-bar.tsx'
import { StatBlock } from './blocks/stat.tsx'
import { SuggestionsBlock } from './blocks/suggestions.tsx'
import { TableBlock } from './blocks/table.tsx'
import type { Block, BlockError } from './schema.ts'

const s = strings.genui

/** Сам блок, без карточки: в карточке их может лежать несколько. */
function BlockBody({ block }: { block: Block }) {
  switch (block.type) {
    case 'stat':
      return <StatBlock label={block.label} value={block.value} sub={block.sub} />
    case 'result_bar':
      return (
        <ResultBarBlock wins={block.wins} draws={block.draws} losses={block.losses} label={block.label} />
      )
    case 'table':
      return <TableBlock columns={block.columns} rows={block.rows} highlight={block.highlight} />
    case 'board':
      return (
        <BoardBlock
          fen={block.fen}
          caption={block.caption}
          highlights={block.highlights}
          arrows={block.arrows}
          orientation={block.orientation}
        />
      )
    case 'line_chart':
      return <LineChartBlock series={block.series} yLabel={block.yLabel} />
    case 'bar_chart':
      return <BarChartBlock items={block.items} unit={block.unit} />
    case 'games':
      return <GamesBlock items={block.items} />
    case 'suggestions':
      return <SuggestionsBlock items={block.items} />
  }
}

/** Заголовок блока внутри карточки — когда он не первый и не стал шапкой. */
const Titled = ({ title, children }: { title?: string; children: ComponentChildren }) =>
  title ? (
    <div class="flex flex-col gap-2">
      <div class="font-serif text-[17px] font-bold">{title}</div>
      {children}
    </div>
  ) : (
    <>{children}</>
  )

/**
 * Карточка из макета. Идущие подряд блоки живут в одной карточке — в макете это один
 * объект ответа, а не стопка рамок. Доска, как и там, уходит в правую колонку 240px.
 */
export function BlockCard({ blocks }: { blocks: Block[] }) {
  const side = blocks.filter((b) => b.type === 'board')
  const main = blocks.filter((b) => b.type !== 'board')
  const [header, ...rest] = main.length ? main : side
  if (!header) return null
  const body = main.length ? rest : side.slice(1)
  const column = (list: Block[], first?: Block) => (
    <div class="flex min-w-0 flex-col gap-3.5">
      {first && <BlockBody block={first} />}
      {list.map((b, i) => (
        <Titled key={i} title={b.title}>
          <BlockBody block={b} />
        </Titled>
      ))}
    </div>
  )

  return (
    <div class="flex flex-col gap-3.5 rounded-md border border-line bg-card px-5 py-[18px]">
      {header.title && <div class="font-serif text-xl font-bold">{header.title}</div>}
      {main.length && side.length ? (
        <div class="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-6 max-lg:grid-cols-1">
          {column(body, header)}
          {column(side)}
        </div>
      ) : (
        column(body, header)
      )}
    </div>
  )
}

/** Блок не сложился — показываем пометку и исходник, но сообщение остаётся читаемым. */
export function BlockErrorView({ error, json }: BlockError) {
  return (
    <details class="rounded-md border border-line bg-card px-5 py-3 text-[13px] text-ink-2">
      <summary class="cursor-pointer">
        {s.blockFailed} — {error.split('\n')[0]}
      </summary>
      <pre class="mt-2 overflow-x-auto font-mono text-xs">{json}</pre>
    </details>
  )
}

/** Блок ещё дописывается стримом. */
export function BlockPending() {
  return (
    <div class="rounded-md border border-dashed border-line bg-card px-5 py-[18px] text-[13px] text-ink-3">
      {s.blockBuilding}
    </div>
  )
}

export { SuggestionsBlock }
