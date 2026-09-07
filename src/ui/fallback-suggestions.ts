/** Запасные чипы, когда модель забыла suggestions-блок. Если в треде есть query_games с неразобранными партиями — чипы несут их id дословно (формат правила 20), иначе generic-верификации. */

interface CallLike {
  name: string
  result?: unknown
}

export function fallbackSuggestions(calls: CallLike[]): string[] {
  const ids: string[] = []
  for (const c of calls) {
    if (c.name !== 'query_games' || !c.result || typeof c.result !== 'object') continue
    const items = (c.result as { items?: { id?: unknown; analyzed?: unknown }[] }).items
    if (!Array.isArray(items)) continue
    for (const it of items) {
      if (typeof it?.id === 'string' && it.analyzed === false && !ids.includes(it.id)) ids.push(it.id)
      if (ids.length >= 3) break
    }
    if (ids.length >= 3) break
  }
  const out: string[] = []
  if (ids.length) out.push(`Analyze with engine: ${ids.join(', ')}`)
  out.push('Show the games behind these numbers')
  return out.slice(0, 3)
}
