/**
 * `text/event-stream` → поток разобранных JSON-событий.
 * Чанки склеиваются: JSON может разорваться посередине.
 * Комментарии (`: OPENROUTER PROCESSING`) пропускаются, `data: [DONE]` завершает поток.
 */
export async function* sseJson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        yield JSON.parse(payload) as T
      }
    }
  } finally {
    reader.releaseLock()
  }
}
