/**
 * Импорт PGN на main thread.
 *
 * Ранее использовался Web Worker (import.worker.ts) —
 * для возврата: `git log --all -- src/pgn/import.worker.ts`.
 */
import { getGameIds, putMany, loadGames } from '../db/games.ts'
import { putEvals } from '../db/evals.ts'
import type { Game, GameEvals } from '../db/schema.ts'
import { parseGame } from './parse.ts'
import { splitPgn } from './split.ts'

export interface ImportRequest {
  text: string
  userName: string
}

export interface ImportDone {
  total: number
  imported: number
  skipped: number
  duplicates: number
}

const CHUNK = 50

export async function runImport(
  { text, userName }: ImportRequest,
  onProgress: (done: number, total: number) => void,
): Promise<ImportDone> {
  const chunks = splitPgn(text)
  console.log('[import] split into', chunks.length, 'chunks')
  console.log('[import] first chunk preview:', chunks[0]?.substring(0, 300))
  console.log('[import] userName:', userName)
  const seen = await getGameIds()
  let imported = 0
  let skipped = 0
  let duplicates = 0

  // Debug: show first game content
  if (chunks[0]) {
    console.log('[import] first game full text:', chunks[0])
  }

  for (let i = 0; i < chunks.length; i += CHUNK) {
    const batch: Game[] = []
    const evalRows: GameEvals[] = []
    for (const raw of chunks.slice(i, i + CHUNK)) {
      const parsed = parseGame(raw, userName)
      if (!parsed) {
        skipped++
        continue
      }
      if (seen.has(parsed.game.id)) {
        duplicates++
        continue
      }
      seen.add(parsed.game.id)
      batch.push(parsed.game)
      if (parsed.evals) {
        evalRows.push({
          gameId: parsed.game.id,
          depth: 0,
          source: 'lichess',
          plies: parsed.evals,
        })
      }
    }
    if (batch.length) await putMany(batch)
    if (evalRows.length) await putEvals(evalRows)
    imported += batch.length
    onProgress(Math.min(i + CHUNK, chunks.length), chunks.length)
  }

  await loadGames()

  return { total: chunks.length, imported, skipped, duplicates }
}
