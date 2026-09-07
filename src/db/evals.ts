import { db, type GameEvals } from './schema.ts'

export async function getEvals(gameId: string) {
  return (await db()).get('evals', gameId)
}

export async function putEvals(rows: GameEvals[]) {
  const tx = (await db()).transaction('evals', 'readwrite')
  await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done])
}
