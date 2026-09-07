export interface InferredUser {
  name: string
  /** Доля партий, где ник встретился. < 0.9 — стоит переспросить. */
  share: number
  top: { name: string; count: number }[]
}

/** Самый частый ник среди White/Black во всём архиве. */
export function inferUser(archive: string): InferredUser | null {
  const counts = new Map<string, number>()
  let players = 0
  for (const m of archive.matchAll(/^\[(?:White|Black)\s+"([^"]*)"\]/gm)) {
    const name = m[1]
    if (!name || name === '?') continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
    players++
  }
  if (players === 0) return null

  const top = [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  const best = top[0]!
  const gameCount = Math.ceil(players / 2)
  return { name: best.name, share: Math.min(1, best.count / gameCount), top }
}
