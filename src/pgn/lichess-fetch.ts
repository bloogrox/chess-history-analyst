/**
 * Архив партий с Lichess по нику. Публичный эндпоинт, без токена:
 * CORS проверен живым запросом — Lichess отдаёт `Access-Control-Allow-Origin` с нашим origin.
 * Отдаёт весь PGN одним текстом, дальше его разбирает тот же воркер, что и файл.
 */
const API = 'https://lichess.org/api/games/user/'

/** Граница партии в потоке: начало строки `[Event ` — то же правило, что в splitPgn. */
const MARK = '\n[Event '

export interface FetchOptions {
  userName: string
  /** Докачка: только партии позже этого момента (мс). */
  since?: number
  /** Максимум партий для выгрузки. По умолчанию без лимита. */
  max?: number
  signal?: AbortSignal
  /** Сколько партий уже полностью получено. */
  onProgress?: (games: number) => void
}

export async function fetchLichessGames({
  userName,
  since,
  max,
  signal,
  onProgress,
}: FetchOptions): Promise<string> {
  const url = new URL(encodeURIComponent(userName), API)
  url.search = new URLSearchParams({
    evals: 'true',
    opening: 'true',
    clocks: 'false',
    ...(since ? { since: String(since) } : {}),
    ...(max ? { max: String(max) } : {}),
  }).toString()

  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' }, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new Error('Нет связи с Lichess')
  }
  if (response.status === 404) throw new Error(`Ник «${userName}» на Lichess не найден`)
  if (response.status === 429) throw new Error('Lichess ограничил скорость, подождите минуту')
  if (!response.ok) throw new Error(`Lichess ответил ${response.status}`)
  if (!response.body) throw new Error('Lichess вернул пустой ответ')

  // ponytail: архив целиком в памяти, как и файл; потолок тот же — сотни МБ
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let cursor = 0
  let games = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      for (let i = text.indexOf(MARK, cursor); i >= 0; i = text.indexOf(MARK, cursor)) {
        games++
        cursor = i + MARK.length
      }
      onProgress?.(games)
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new Error('Связь с Lichess оборвалась')
  }
  return text + decoder.decode()
}
