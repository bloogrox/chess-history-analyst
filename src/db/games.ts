import { signal } from '@preact/signals'
import { db, type Analysis, type Game } from './schema.ts'

/** Вся библиотека в памяти. Единственный источник для UI и инструментов агента. */
export const games = signal<Game[]>([])

export async function loadGames() {
  games.value = await (await db()).getAll('games')
}

export async function putMany(list: Game[]) {
  const tx = (await db()).transaction('games', 'readwrite')
  await Promise.all([...list.map((g) => tx.store.put(g)), tx.done])
}

export async function getGameIds(): Promise<Set<string>> {
  return new Set(await (await db()).getAllKeys('games'))
}

/** Партии и оценки уходят вместе: оценка без партии никому не нужна. */
export async function clearLibrary() {
  const d = await db()
  await Promise.all([d.clear('games'), d.clear('evals')])
  games.value = []
}

export async function updateAnalysis(id: string, analysis: Analysis) {
  const d = await db()
  const game = await d.get('games', id)
  if (!game) return
  await d.put('games', { ...game, analysis })
  games.value = games.value.map((g) => (g.id === id ? { ...g, analysis } : g))
}
