const SQUARE = 28
const LABEL = 14
const FILES = 'abcdefgh'

/** Фигурки как в макете; у чёрной пешки — селектор текстового начертания, иначе браузер рисует эмодзи. */
const PIECES: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎',
}

/** Расстановка из FEN → 64 клетки, от a8 до h1. Мусор в строке просто даёт пустые клетки. */
function placement(fen: string): (string | null)[] {
  const board: (string | null)[] = []
  for (const row of (fen.split(' ')[0] ?? '').split('/').slice(0, 8)) {
    const line: (string | null)[] = []
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') line.push(...Array<null>(Number(ch)).fill(null))
      else if (PIECES[ch]) line.push(ch)
    }
    board.push(...line.slice(0, 8), ...Array<null>(Math.max(0, 8 - line.length)).fill(null))
  }
  return [...board, ...Array<null>(Math.max(0, 64 - board.length)).fill(null)]
}

export function BoardBlock({
  fen,
  caption,
  highlights,
  arrows,
  orientation = 'white',
}: {
  fen: string
  caption?: string
  highlights?: string[]
  arrows?: [string, string][]
  orientation?: 'white' | 'black'
}) {
  const board = placement(fen)
  const flip = orientation === 'black'
  const files = flip ? [...FILES].reverse() : [...FILES]
  const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]
  const lit = new Set(highlights ?? [])

  /** Клетка → центр в пикселях поля (без колонки подписей). */
  const center = (square: string): [number, number] | null => {
    const col = files.indexOf(square[0] ?? '')
    const row = ranks.indexOf(Number(square[1]))
    return col < 0 || row < 0 ? null : [(col + 0.5) * SQUARE, (row + 0.5) * SQUARE]
  }

  return (
    <div class="flex flex-col gap-2">
      <div
        class="relative grid w-fit overflow-hidden rounded-[3px] border border-square-dark bg-card"
        style={{
          gridTemplateColumns: `${LABEL}px repeat(8, ${SQUARE}px)`,
          gridTemplateRows: `repeat(8, ${SQUARE}px) ${LABEL}px`,
        }}
      >
        {ranks.flatMap((rank) => [
          <div key={`r${rank}`} class="flex items-center justify-center font-mono text-[9px] text-ink-3">
            {rank}
          </div>,
          ...files.map((file) => {
            const square = file + rank
            const piece = board[(8 - rank) * 8 + FILES.indexOf(file)]
            const light = (FILES.indexOf(file) + rank) % 2 === 0
            return (
              <div
                key={square}
                class={`flex items-center justify-center font-chess text-[22px] leading-none ${
                  lit.has(square) ? 'bg-ochre-tint' : light ? 'bg-square-light' : 'bg-square-dark'
                }`}
              >
                {piece ? PIECES[piece] : ''}
              </div>
            )
          }),
        ])}
        <div />
        {files.map((file) => (
          <div key={`f${file}`} class="flex items-center justify-center font-mono text-[9px] text-ink-3">
            {file}
          </div>
        ))}

        {!!arrows?.length && (
          <svg
            class="pointer-events-none absolute"
            style={{ left: LABEL, top: 0 }}
            width={SQUARE * 8}
            height={SQUARE * 8}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="genui-arrow"
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="5"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 z" fill="#915200" />
              </marker>
            </defs>
            {arrows.map(([from, to], i) => {
              const a = center(from)
              const b = center(to)
              if (!a || !b) return null
              return (
                <line
                  key={i}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke="#915200"
                  stroke-width="4"
                  stroke-opacity="0.75"
                  marker-end="url(#genui-arrow)"
                />
              )
            })}
          </svg>
        )}
      </div>
      {caption && <div class="max-w-[240px] text-xs leading-[1.45] text-ink-2">{caption}</div>}
    </div>
  )
}
